import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { ResumeContent, ResumeStyle, StyleOverrides, TemplateId } from '../../types/resume';
import { pageDims } from './pageSize';
import { ResumePreview } from './ResumePreview';

function measureHeight(content: ResumeContent, templateId: TemplateId, style: ResumeStyle) {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${pageDims(style.pageSize).w}px;visibility:hidden;pointer-events:none`;
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(createElement(ResumePreview, { content, templateId, style })));
  const height = (host.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0;
  root.unmount();
  host.remove();
  return height;
}

function ease(current: number, floor: number, t: number, step: number) {
  if (current <= floor) return current;
  const v = current + (floor - current) * t;
  return Number(Math.max(floor, Math.round(v / step) * step).toFixed(2));
}

/**
 * Gently tighten spacing, margins, line height and text size (never below readable floors)
 * until the resume fits on one page.
 */
export function fitToOnePage(content: ResumeContent, templateId: TemplateId, style: ResumeStyle) {
  const steps = 14;
  let patch: StyleOverrides = {};
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    patch = {
      sectionSpacing: ease(style.sectionSpacing, 8, t, 1),
      margin: ease(style.margin, 32, t, 1),
      lineHeight: ease(style.lineHeight, 1.25, t, 0.05),
      fontSize: ease(style.fontSize, 10, t, 0.5),
    };
    if (measureHeight(content, templateId, { ...style, ...patch }) <= pageDims(style.pageSize).h) {
      return { fitted: true, patch };
    }
  }
  return { fitted: false, patch };
}
