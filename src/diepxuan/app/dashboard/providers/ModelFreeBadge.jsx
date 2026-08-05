"use client";

import PropTypes from "prop-types";

export default function ModelFreeBadge({ free }) {
  if (!free) return null;
  return (
    <span className="shrink-0 rounded bg-green-500/10 px-1.5 py-0.5 text-[9px] font-bold text-green-500">
      FREE
    </span>
  );
}

ModelFreeBadge.propTypes = {
  free: PropTypes.bool,
};
