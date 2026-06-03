import { useState } from "react";
import { MarkUnderline } from "../components/docs/MarkUnderline.tsx";
import { SQUIGGLES } from "../components/docs/squiggles.ts";

const BROWN = "#73574a";

// Demo: every marker squiggle in the library, drawn at once. Hit Replay to re-scribble them
// all (the same draw animation the legend underline uses). The underline picks one of these
// at random on each selection, so it looks freshly hand-drawn every time.
export function Squiggles() {
  const [gen, setGen] = useState(0);

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex items-center justify-between">
        <h3 className="m-0" style={{ fontSize: 16, fontWeight: 600, color: BROWN }}>
          {SQUIGGLES.length} marker squiggles
        </h3>
        <button
          type="button"
          onClick={() => setGen((g) => g + 1)}
          className="cursor-pointer rounded-md border-0 px-3 py-1.5"
          style={{ background: BROWN, color: "#fff", fontSize: 13 }}
        >
          Replay
        </button>
      </div>

      <div className="grid grid-cols-3 gap-x-6 gap-y-8">
        {SQUIGGLES.map((sq, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div
              className="flex items-center justify-center"
              style={{ width: 150, height: 26, background: "#fcfbf9", borderRadius: 6 }}
            >
              <div style={{ width: 132, height: 18 }}>
                {/* key remounts on Replay so the draw animation re-runs */}
                <MarkUnderline key={`${gen}-${i}`} squiggle={sq} color={BROWN} />
              </div>
            </div>
            <span style={{ fontSize: 12, color: BROWN, opacity: 0.5, fontVariantNumeric: "tabular-nums" }}>
              {i + 1}
              {sq.mirror ? " · mirror" : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
