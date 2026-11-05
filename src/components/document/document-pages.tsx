"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { DocViewModel } from "@/lib/render/view-model";
import type { DesignCustomization, SectionId, TemplateId } from "@/lib/schema";
import { fontStack } from "@/lib/templates-meta";
import { useMounted } from "@/hooks/use-mounted";
import {
  EmptyRow,
  NotesSection,
  PageFooter,
  PaymentSection,
  Row,
  ScheduleSection,
  SignatureSection,
  TableHead,
  TaxSummarySection,
  TermsSection,
  TotalsSection,
  sectionHasContent,
} from "./blocks";
import { DocProvider, type DocContextValue } from "./context";
import { DENSITY, baseMargins, onColor, pageMetrics, type PageMetrics } from "./layout";
import { itemKey, paginate, type Measurements, type PageItem } from "./paginate";
import { getDocumentTemplate } from "./templates";
import type { DocumentTemplate } from "./templates/types";

const SHARED_SECTIONS: Record<SectionId, () => ReactNode> = {
  totals: () => <TotalsSection />,
  schedule: () => <ScheduleSection />,
  taxSummary: () => <TaxSummarySection />,
  payment: () => <PaymentSection />,
  notes: () => <NotesSection />,
  terms: () => <TermsSection />,
  signature: () => <SignatureSection />,
};

export interface DocumentLayoutInfo {
  pageCount: number;
  metrics: PageMetrics;
}

export interface DocumentPagesProps {
  vm: DocViewModel;
  design: DesignCustomization;
  templateId: TemplateId;
  /** Render only the first N pages (thumbnails). */
  maxPages?: number;
  /** Wrap each page element (e.g. in a scaling frame). */
  renderPage?: (page: ReactNode, index: number, pageCount: number) => ReactNode;
  onLayout?: (info: DocumentLayoutInfo) => void;
}

export function useDocumentStyle(
  vm: DocViewModel,
  design: DesignCustomization,
  template: DocumentTemplate,
) {
  return useMemo(() => {
    const base = baseMargins(design);
    const pad = template.pageBox ? template.pageBox(base, design) : base;
    const metrics = pageMetrics(design, pad);
    const style = {
      "--doc-primary": design.primaryColor,
      "--doc-accent": design.accentColor,
      "--doc-on-primary": onColor(design.primaryColor),
      "--doc-font": fontStack(design.fontFamily),
      "--doc-fs": `${design.fontSize}pt`,
      "--doc-d": DENSITY[design.density],
      "--doc-cols": vm.gridTemplate,
      "--page-w": `${metrics.widthMm}mm`,
      "--page-h": `${metrics.heightMm}mm`,
      "--pad-t": `${pad.top}px`,
      "--pad-r": `${pad.right}px`,
      "--pad-b": `${pad.bottom}px`,
      "--pad-l": `${pad.left}px`,
    } as CSSProperties;
    return { style, metrics };
  }, [vm.gridTemplate, design, template]);
}

function samePages(a: PageItem[][] | null, b: PageItem[][]) {
  if (!a || a.length !== b.length) return false;
  return a.every(
    (page, i) =>
      page.length === b[i].length && page.every((item, j) => itemKey(item) === itemKey(b[i][j])),
  );
}

/**
 * Lays the document out on fixed-size pages.
 *
 * A hidden copy of every block is rendered at the real page width, measured,
 * and packed into pages (see `paginate`). The visible pages then render the
 * exact same blocks, so the preview, thumbnails and printed PDF all break in
 * the same places.
 */
export function DocumentPages({
  vm,
  design,
  templateId,
  maxPages,
  renderPage,
  onLayout,
}: DocumentPagesProps) {
  const template = getDocumentTemplate(templateId);
  const { style, metrics } = useDocumentStyle(vm, design, template);
  const mounted = useMounted();
  const measureRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<PageItem[][] | null>(null);

  const sections = useMemo(
    () => design.sectionOrder.filter((id) => sectionHasContent(id, vm, design)),
    [design, vm],
  );

  const ctx = useMemo<DocContextValue>(
    () => ({ vm, design, templateId }),
    [vm, design, templateId],
  );

  const measure = useCallback(() => {
    const root = measureRef.current;
    if (!root) return;
    // While printing, the measuring copy is hidden (display: none) and would
    // report zero heights — keep the pagination computed on screen.
    if (window.matchMedia("print").matches || root.getClientRects().length === 0) return;
    const heights = new Map<string, number>();
    root.querySelectorAll<HTMLElement>("[data-m]").forEach((el) => {
      heights.set(el.dataset.m!, el.getBoundingClientRect().height);
    });
    const h = (key: string) => heights.get(key) ?? 0;
    const m: Measurements = {
      header: h("header"),
      cont: h("cont"),
      thead: h("thead"),
      empty: h("empty"),
      rows: vm.rows.map((_, i) => h(`row-${i}`)),
      sections: sections.map((id) => ({ id, height: h(`section-${id}`) })),
    };
    const next = paginate(m, metrics.capacity);
    setPages((prev) => (samePages(prev, next) ? prev : next));
  }, [vm.rows, sections, metrics.capacity]);

  // Re-measure synchronously after every content/design change (before paint).
  useLayoutEffect(() => {
    if (mounted) measure();
  }, [mounted, measure, ctx]);

  // Re-measure when web fonts finish loading or images change block sizes.
  useEffect(() => {
    const root = measureRef.current;
    if (!mounted || !root) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    document.fonts?.ready.then(schedule).catch(() => {});
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [mounted, measure]);

  const pageCount = pages?.length ?? 1;

  useEffect(() => {
    if (pages) onLayout?.({ pageCount: pages.length, metrics });
  }, [pages, metrics, onLayout]);

  const T = template;
  const renderItem = (item: PageItem): ReactNode => {
    switch (item.type) {
      case "header":
        return <T.Header />;
      case "cont":
        return <T.ContinuationHeader />;
      case "thead":
        return <TableHead labels={T.columnLabels} />;
      case "empty":
        return <EmptyRow />;
      case "row": {
        const row = vm.rows[item.index];
        return row ? <Row row={row} index={item.index} /> : null;
      }
      case "section": {
        const Custom = T.sections?.[item.id];
        return Custom ? <Custom /> : SHARED_SECTIONS[item.id]();
      }
    }
  };

  const visiblePages = (pages ?? [[]]).slice(0, maxPages ?? Infinity);

  const pageNodes = visiblePages.map((items, index) => {
    const page = (
      <div
        className="doc doc-page"
        style={style}
        data-table={design.tableStyle}
        data-page={index + 1}
      >
        {T.Decor && <T.Decor pageIndex={index} pageCount={pageCount} />}
        {items.map((item) => (
          <div className="doc-block" key={itemKey(item)}>
            {renderItem(item)}
          </div>
        ))}
        <PageFooter pageIndex={index} pageCount={pageCount} />
      </div>
    );
    return (
      <Fragment key={index}>{renderPage ? renderPage(page, index, pageCount) : page}</Fragment>
    );
  });

  const measureNode = mounted
    ? createPortal(
        <DocProvider value={ctx}>
          <div
            ref={measureRef}
            className="doc doc-page doc-measure"
            style={style}
            data-table={design.tableStyle}
            aria-hidden
          >
            <div className="doc-block" data-m="header">
              <T.Header />
            </div>
            <div className="doc-block" data-m="cont">
              <T.ContinuationHeader />
            </div>
            <div className="doc-block" data-m="thead">
              <TableHead labels={T.columnLabels} />
            </div>
            <div className="doc-block" data-m="empty">
              <EmptyRow />
            </div>
            {vm.rows.map((row, i) => (
              <div className="doc-block" data-m={`row-${i}`} key={row.id}>
                <Row row={row} index={i} />
              </div>
            ))}
            {sections.map((id) => {
              const Custom = T.sections?.[id];
              return (
                <div className="doc-block" data-m={`section-${id}`} key={id}>
                  {Custom ? <Custom /> : SHARED_SECTIONS[id]()}
                </div>
              );
            })}
          </div>
        </DocProvider>,
        document.body,
      )
    : null;

  return (
    <DocProvider value={ctx}>
      {pageNodes}
      {measureNode}
    </DocProvider>
  );
}
