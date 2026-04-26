import type { Direction, Slot } from "../../src/index";

export function ActiveClue({ slot }: { readonly slot: Slot | undefined }) {
  return (
    <section className="active-clue" aria-label="پرسش فعال" aria-live="polite">
      {slot ? (
        <>
          <div className="clue-kicker">
            {slot.direction === "across" ? "ردیف" : "ستون"} {slot.groupNum}، کلمه {slot.wordIndexInGroup}
            <span>{slot.length} حرف</span>
          </div>
          <p>{slot.clue}</p>
        </>
      ) : (
        <p>یک خانه سفید را انتخاب کنید.</p>
      )}
    </section>
  );
}

interface CluePanelProps {
  readonly acrossSlots: readonly Slot[];
  readonly downSlots: readonly Slot[];
  readonly activeSlot: Slot | undefined;
  readonly clueTab: Direction;
  readonly onTabChange: (direction: Direction) => void;
  readonly onClueClick: (slot: Slot) => void;
}

export function CluePanel({
  acrossSlots,
  downSlots,
  activeSlot,
  clueTab,
  onTabChange,
  onClueClick,
}: CluePanelProps) {
  return (
    <aside className="clue-panel">
      <div className="clue-tabs" role="tablist" aria-label="نوع پرسش">
        <button
          type="button"
          role="tab"
          aria-selected={clueTab === "across"}
          onClick={() => onTabChange("across")}
        >
          افقی
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={clueTab === "down"}
          onClick={() => onTabChange("down")}
        >
          عمودی
        </button>
      </div>

      <div className="clue-lists">
        <GroupedClueList
          title="افقی"
          slots={acrossSlots}
          activeSlot={activeSlot}
          visibleOnSmall={clueTab === "across"}
          onClueClick={onClueClick}
        />
        <GroupedClueList
          title="عمودی"
          slots={downSlots}
          activeSlot={activeSlot}
          visibleOnSmall={clueTab === "down"}
          onClueClick={onClueClick}
        />
      </div>
    </aside>
  );
}

function groupSlotsByGroupNum(slots: readonly Slot[]): [number, Slot[]][] {
  const map = new Map<number, Slot[]>();
  for (const slot of slots) {
    const group = map.get(slot.groupNum);
    if (group) {
      group.push(slot);
    } else {
      map.set(slot.groupNum, [slot]);
    }
  }
  return Array.from(map.entries()).sort(([a], [b]) => a - b);
}

function GroupedClueList({
  title,
  slots,
  activeSlot,
  visibleOnSmall,
  onClueClick,
}: {
  readonly title: string;
  readonly slots: readonly Slot[];
  readonly activeSlot: Slot | undefined;
  readonly visibleOnSmall: boolean;
  readonly onClueClick: (slot: Slot) => void;
}) {
  const groups = groupSlotsByGroupNum(slots);
  return (
    <section className={`clue-list ${visibleOnSmall ? "clue-list-visible" : ""}`} aria-label={title}>
      <ol>
        {groups.map(([groupNum, groupSlots]) => (
          <li key={groupNum} className="clue-group">
            <span className="clue-group-number">{groupNum}</span>
            <span className="clue-group-words">
              {groupSlots.map((slot, i) => (
                <span key={slot.id} className="clue-word-entry">
                  {i > 0 && <span className="clue-sep"> — </span>}
                  <button
                    type="button"
                    className={`clue-item-btn${activeSlot?.id === slot.id ? " clue-selected" : ""}`}
                    onClick={() => onClueClick(slot)}
                  >
                    {slot.clue}
                  </button>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
