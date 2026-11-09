import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Hand,
} from "lucide-react";

interface DraggableScrollTableContainerProps {
  children: ReactNode;
  className?: string;
}

export default function DraggableScrollTableContainer({
  children,
  className = "",
}: DraggableScrollTableContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const topMirrorRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef<"main" | "mirror" | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [scrollState, setScrollState] = useState({
    scrollLeft: 0,
    maxScrollLeft: 0,
    clientWidth: 0,
    scrollWidth: 0,
  });

  const dragInfoRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
  });

  const updateMetrics = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
    setScrollState({
      scrollLeft: Math.round(el.scrollLeft),
      maxScrollLeft: Math.round(maxScrollLeft),
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
    });
    if (topMirrorRef.current && syncingRef.current !== "mirror") {
      topMirrorRef.current.scrollLeft = el.scrollLeft;
    }
  }, []);

  useEffect(() => {
    updateMetrics();
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => updateMetrics());
    ro.observe(el);
    if (el.firstElementChild) {
      ro.observe(el.firstElementChild);
    }
    window.addEventListener("resize", updateMetrics);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateMetrics);
    };
  }, [updateMetrics, children]);

  const handleMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    // Cho phép bấm trực tiếp vào button/select hoặc kéo thanh input range bình thường
    if (target?.closest("button, select, a, [data-no-drag='true']")) {
      return;
    }

    const el = containerRef.current;
    if (!el) return;

    dragInfoRef.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      startScrollLeft: el.scrollLeft,
      startScrollTop: el.scrollTop,
    };
  };

  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      const info = dragInfoRef.current;
      if (!info.active) return;
      const el = containerRef.current;
      if (!el) return;

      const dx = e.clientX - info.startX;
      const dy = e.clientY - info.startY;

      if (!info.moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) {
        return;
      }

      if (!info.moved) {
        info.moved = true;
        setIsDragging(true);
        // Nếu đang focus vào ô input khi bắt đầu kéo thì blur để kéo mượt
        if (
          document.activeElement instanceof HTMLElement &&
          el.contains(document.activeElement)
        ) {
          document.activeElement.blur();
        }
      }

      e.preventDefault();
      el.scrollLeft = info.startScrollLeft - dx;
      el.scrollTop = info.startScrollTop - dy;
      updateMetrics();
    };

    const handleWindowMouseUp = () => {
      if (!dragInfoRef.current.active) return;
      dragInfoRef.current.active = false;
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleWindowMouseMove, {
      passive: false,
    });
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [updateMetrics]);

  const handleClickCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (dragInfoRef.current.moved) {
      e.stopPropagation();
      e.preventDefault();
      dragInfoRef.current.moved = false;
    }
  };

  const scrollByOffset = (offset: number) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollBy({ left: offset, behavior: "smooth" });
  };

  const scrollToEdge = (edge: "start" | "end") => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({
      left: edge === "start" ? 0 : el.scrollWidth,
      behavior: "smooth",
    });
  };

  const handleRangeChange = (nextVal: number) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollLeft = nextVal;
    updateMetrics();
  };

  return (
    <div
      className={`relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white shadow-sm ${className}`}
    >
      {/* Vùng bảng chính: hỗ trợ giữ chuột trái kéo ngang/dọc */}
      <div
        ref={containerRef}
        onScroll={() => {
          syncingRef.current = "main";
          updateMetrics();
          queueMicrotask(() => {
            syncingRef.current = null;
          });
        }}
        onMouseDown={handleMouseDown}
        onClickCapture={handleClickCapture}
        className={`min-h-0 flex-1 overflow-auto ${
          isDragging ? "cursor-grabbing select-none" : "cursor-grab"
        }`}
      >
        {children}
      </div>

      {/* Thanh kéo ngang + nút điều hướng luôn ghim cố định ngay dưới màn hình */}
      <div
        data-no-drag="true"
        className="z-30 flex shrink-0 flex-col gap-1 border-t border-slate-200 bg-slate-100/95 px-3 py-1.5 backdrop-blur"
      >
        {/* Thanh scrollbar đồng bộ trực tiếp */}
        {scrollState.maxScrollLeft > 0 && (
          <div
            ref={topMirrorRef}
            onScroll={(e) => {
              if (syncingRef.current === "main") return;
              syncingRef.current = "mirror";
              if (containerRef.current) {
                containerRef.current.scrollLeft = e.currentTarget.scrollLeft;
                setScrollState((prev) => ({
                  ...prev,
                  scrollLeft: Math.round(e.currentTarget.scrollLeft),
                }));
              }
              queueMicrotask(() => {
                syncingRef.current = null;
              });
            }}
            className="h-3.5 w-full overflow-x-auto overflow-y-hidden rounded bg-slate-200/80"
          >
            <div
              style={{
                width: `${Math.max(scrollState.scrollWidth, scrollState.clientWidth + 1)}px`,
                height: "1px",
              }}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
            <Hand size={13} className="text-primary" />
            <span>
              Giữ chuột trái trên bảng để kéo qua lại hoặc dùng thanh kéo dưới
              đây
            </span>
          </div>

          <div className="flex flex-1 items-center justify-end gap-1.5 sm:max-w-xl">
            <button
              type="button"
              onClick={() => scrollToEdge("start")}
              disabled={scrollState.scrollLeft <= 0}
              title="Về cột đầu tiên"
              className="inline-flex h-7 items-center gap-0.5 rounded border border-slate-300 bg-white px-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronsLeft size={13} />
              Đầu
            </button>
            <button
              type="button"
              onClick={() => scrollByOffset(-380)}
              disabled={scrollState.scrollLeft <= 0}
              className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft size={13} />
              Kéo trái
            </button>

            <input
              type="range"
              min={0}
              max={Math.max(1, scrollState.maxScrollLeft)}
              value={Math.min(
                scrollState.scrollLeft,
                Math.max(1, scrollState.maxScrollLeft),
              )}
              onChange={(e) => handleRangeChange(Number(e.target.value))}
              aria-label="Thanh kéo ngang bảng"
              className="h-2 min-w-[120px] flex-1 cursor-pointer accent-primary"
            />

            <button
              type="button"
              onClick={() => scrollByOffset(380)}
              disabled={scrollState.scrollLeft >= scrollState.maxScrollLeft}
              className="inline-flex h-7 items-center gap-1 rounded border border-primary/40 bg-blue-50 px-2.5 text-[11px] font-bold text-primary hover:bg-blue-100 disabled:opacity-40"
            >
              Kéo phải
              <ChevronRight size={13} />
            </button>
            <button
              type="button"
              onClick={() => scrollToEdge("end")}
              disabled={scrollState.scrollLeft >= scrollState.maxScrollLeft}
              title="Đến cột cuối cùng"
              className="inline-flex h-7 items-center gap-0.5 rounded border border-slate-300 bg-white px-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Cuối
              <ChevronsRight size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

