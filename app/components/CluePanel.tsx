import { ChevronLast, ChevronLeft, ChevronRight, Eraser, RotateCw } from "lucide-react";
import type { Direction, Slot } from "../../src/index";
import type { TrayTile } from "../crosswordUi";

interface ActiveClueProps {
  readonly slot: Slot | undefined;
  readonly showTray?: boolean;
  readonly trayTiles?: readonly TrayTile[];
  readonly trayUsedTileIds?: ReadonlySet<string>;
  readonly onTrayTileTap?: (tile: TrayTile) => void;
  readonly onNavFirst?: () => void;
  readonly onNavPrev?: () => void;
  readonly onNavClear?: () => void;
  readonly onNavNext?: () => void;
  readonly onToggleDirection?: () => void;
}

export function ActiveClue({
  slot,
  showTray,
  trayTiles = [],
  trayUsedTileIds,
  onTrayTileTap,
  onNavFirst,
  onNavPrev,
  onNavClear,
  onNavNext,
  onToggleDirection,
}: ActiveClueProps) {
  const handleGoogleSearch = () => {
    if (slot?.clue) {
      const searchQuery = `${slot.clue} در جدول`;
      const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
      window.open(googleUrl, "_blank");
    }
  };
  const isDown = slot?.direction === "down";

  return (
    <section className="active-clue" aria-label="پرسش فعال" aria-live="polite">
      {slot ? (
        <>
          <p>
            {slot.clue}{" "}
            <button
              type="button"
              onClick={handleGoogleSearch}
              className="clue-search-link"
              title="جستجو در گوگل"
              aria-label="جستجو در گوگل برای این پرسش"
            >
              🔍 جستجو در گوگل
            </button>
          </p>
          {showTray && trayTiles.length > 0 ? (
            <div className="letter-tray" role="list" aria-label="کاشی‌های حرف">
              {trayTiles.map((tile) => {
                const used = trayUsedTileIds?.has(tile.id) ?? false;
                return (
                  <button
                    key={tile.id}
                    type="button"
                    role="listitem"
                    className={`tray-tile${used ? " tray-tile-used" : ""}`}
                    aria-pressed={used}
                    onClick={() => onTrayTileTap?.(tile)}
                  >
                    <span className="cell-value">{tile.letter}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="clue-nav" role="group" aria-label="پیمایش حروف">
            {/* Across slots start at the right edge (RTL), down slots start at the top.
                The same chevrons are reused for both: rotating -90deg turns "points right" /
                "points right with end-bar" into "points up" / "points up with end-bar",
                which is exactly the down-direction meaning. */}
            <button type="button" onClick={onNavFirst} title="رفتن به حرف اول" aria-label="رفتن به حرف اول">
              <ChevronLast size={16} aria-hidden="true" className={isDown ? "clue-nav-rotate" : undefined} />
            </button>
            <button type="button" onClick={onNavPrev} title="حرف قبلی" aria-label="حرف قبلی">
              <ChevronRight size={16} aria-hidden="true" className={isDown ? "clue-nav-rotate" : undefined} />
            </button>
            <button type="button" onClick={onNavNext} title="حرف بعدی" aria-label="حرف بعدی">
              <ChevronLeft size={16} aria-hidden="true" className={isDown ? "clue-nav-rotate" : undefined} />
            </button>
            <button
              type="button"
              onClick={onToggleDirection}
              title="تغییر جهت (افقی/عمودی)"
              aria-label="تغییر جهت افقی یا عمودی"
            >
              <RotateCw size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onNavClear}
              title="پاک کردن پاسخ و شروع دوباره"
              aria-label="پاک کردن پاسخ و شروع دوباره"
              className="clue-nav-danger"
            >
              <Eraser size={16} aria-hidden="true" />
            </button>
          </div>
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
