import { describe, expect, it } from "vitest";
import {
  openaiResponsesToOpenAIRequest,
} from "../../open-sse/translator/request/openai-responses.js";
import { openaiToOpenAIResponsesResponse } from "../../open-sse/translator/response/openai-responses.js";
import { initState } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { isCodexClient, isCustomTool, unwrapCustomToolArguments, wrapCustomToolArguments } from "../../open-sse/diepxuan/codex/customToolBridge.js";

describe("Codex custom tool bridge", () => {
  it("detects Codex client by user-agent", () => {
    expect(isCodexClient({ "user-agent": "codex-cli/1.0" })).toBe(true);
    expect(isCodexClient({ "user-agent": "claude-cli/1.0" })).toBe(false);
  });

  it("identifies apply_patch as a custom tool", () => {
    expect(isCustomTool({ type: "custom", name: "apply_patch" })).toBe(true);
    expect(isCustomTool({ type: "function", name: "other" })).toBe(false);
  });

  it("wraps and unwraps Chat function arguments for custom tools", () => {
    const program = "*** Begin Patch\n*** End Patch";
    const wrapped = wrapCustomToolArguments(program);
    expect(JSON.parse(wrapped)).toEqual({ input: program });
    expect(unwrapCustomToolArguments(wrapped)).toBe(program);
  });

  it("converts Responses custom tool into Chat function tool", () => {
    const out = openaiResponsesToOpenAIRequest("m", {
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }],
      tools: [{ type: "custom", name: "apply_patch", description: "Patch files", format: { type: "grammar", syntax: "lark" } }],
    }, true, null);

    expect(out.tools[0].type).toBe("function");
    expect(out.tools[0].function.name).toBe("apply_patch");
    expect(out.tools[0].function.parameters).toMatchObject({
      type: "object",
      properties: { input: { type: "string" } },
      required: ["input"],
    });
  });

  it("emits custom_tool_call events when Chat returns apply_patch", () => {
    const state = initState(FORMATS.OPENAI_RESPONSES);
    const program = "*** Begin Patch\n*** Update File: a.txt\n@@\n-old\n+new\n*** End Patch";
    const wrapped = wrapCustomToolArguments(program);
    const chunks = [
      { id: "chatcmpl-custom", choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_apply", type: "function", function: { name: "apply_patch", arguments: "" } }] }, finish_reason: null }] },
      { id: "chatcmpl-custom", choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: wrapped } }] }, finish_reason: null }] },
      { id: "chatcmpl-custom", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
    ];

    const events = chunks.flatMap((chunk) => openaiToOpenAIResponsesResponse(chunk, state));
    const added = events.find((event) => event.event === "response.output_item.added");
    const delta = events.find((event) => event.event === "response.custom_tool_call_input.delta");
    const done = events.find((event) => event.event === "response.output_item.done");

    expect(added.data.item).toMatchObject({ type: "custom_tool_call", name: "apply_patch" });
    expect(delta.data.delta).toBe(program);
    expect(done.data.item).toMatchObject({ type: "custom_tool_call", input: program });
  });

  it("keeps normal tool calls as function_call", () => {
    const state = initState(FORMATS.OPENAI_RESPONSES);
    const chunks = [
      { id: "chatcmpl-normal", choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_search", type: "function", function: { name: "search", arguments: "{}" } }] }, finish_reason: null }] },
      { id: "chatcmpl-normal", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
    ];
    const events = chunks.flatMap((chunk) => openaiToOpenAIResponsesResponse(chunk, state));
    expect(events.find((event) => event.event === "response.output_item.added").data.item.type).toBe("function_call");
  });
});
