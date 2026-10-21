import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
  newId,
  newItem,
  type CustomItem,
  type LinkItem,
  type ListSection,
  type ResumeContent,
  type StyleOverrides,
} from '../types/resume';

interface EditorState {
  resumeId: string | null;
  content: ResumeContent | null;
  /** Design overrides on top of the template defaults. Saved beside the content. */
  style: StyleOverrides;
  dirty: boolean;
  /** Increments on every edit so autosave can tell whether newer edits arrived while saving. */
  revision: number;
}

const initialState: EditorState = {
  resumeId: null,
  content: null,
  style: {},
  dirty: false,
  revision: 0,
};

type WithId = { id: string };

function touch(s: EditorState) {
  s.dirty = true;
  s.revision += 1;
}

function list(s: EditorState, section: ListSection): WithId[] {
  return (s.content as ResumeContent)[section] as WithId[];
}

function reId(value: unknown): void {
  if (Array.isArray(value)) value.forEach(reId);
  else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.id === 'string') o.id = newId();
    Object.values(o).forEach(reId);
  }
}

function move<T>(arr: T[], index: number, dir: -1 | 1) {
  const target = index + dir;
  if (index < 0 || target < 0 || target >= arr.length) return false;
  [arr[index], arr[target]] = [arr[target], arr[index]];
  return true;
}

type PersonalField = 'fullName' | 'title' | 'email' | 'phone' | 'location';
type Dir = -1 | 1;

const editorSlice = createSlice({
  name: 'editor',
  initialState,
  reducers: {
    load(s, a: PayloadAction<{ resumeId: string; content: ResumeContent; style: StyleOverrides }>) {
      s.resumeId = a.payload.resumeId;
      s.content = a.payload.content;
      s.style = a.payload.style;
      s.dirty = false;
      s.revision = 0;
    },
    unload() {
      return initialState;
    },
    markSaved(s, a: PayloadAction<number>) {
      if (s.revision === a.payload) s.dirty = false;
    },

    /** Merge design settings. A value of `undefined` clears that override. */
    setStyle(s, a: PayloadAction<StyleOverrides>) {
      const target = s.style as Record<string, unknown>;
      for (const [key, value] of Object.entries(a.payload)) {
        if (value === undefined) delete target[key];
        else target[key] = value;
      }
      touch(s);
    },
    replaceStyle(s, a: PayloadAction<StyleOverrides>) {
      s.style = a.payload;
      touch(s);
    },

    setPersonal(s, a: PayloadAction<{ field: PersonalField; value: string }>) {
      if (!s.content) return;
      s.content.personal[a.payload.field] = a.payload.value;
      touch(s);
    },
    toggleShow(s, a: PayloadAction<'email' | 'phone' | 'location'>) {
      if (!s.content) return;
      s.content.personal.show[a.payload] = !s.content.personal.show[a.payload];
      touch(s);
    },
    addLink(s, a: PayloadAction<string | undefined>) {
      if (!s.content || s.content.personal.links.length >= 10) return;
      s.content.personal.links.push({
        id: newId(),
        label: a.payload ?? '',
        url: '',
        visible: true,
      });
      touch(s);
    },
    updateLink(s, a: PayloadAction<{ id: string; patch: Partial<LinkItem> }>) {
      const link = s.content?.personal.links.find((l) => l.id === a.payload.id);
      if (!link) return;
      Object.assign(link, a.payload.patch);
      touch(s);
    },
    removeLink(s, a: PayloadAction<string>) {
      if (!s.content) return;
      s.content.personal.links = s.content.personal.links.filter((l) => l.id !== a.payload);
      touch(s);
    },

    setSummary(s, a: PayloadAction<string>) {
      if (!s.content) return;
      s.content.summary = a.payload;
      touch(s);
    },

    addItem(s, a: PayloadAction<ListSection>) {
      if (!s.content) return;
      list(s, a.payload).push(newItem(a.payload));
      touch(s);
    },
    updateItem(s, a: PayloadAction<{ section: ListSection; id: string; patch: object }>) {
      if (!s.content) return;
      const item = list(s, a.payload.section).find((i) => i.id === a.payload.id);
      if (!item) return;
      Object.assign(item, a.payload.patch);
      touch(s);
    },
    removeItem(s, a: PayloadAction<{ section: ListSection; id: string }>) {
      if (!s.content) return;
      const arr = list(s, a.payload.section);
      const i = arr.findIndex((x) => x.id === a.payload.id);
      if (i >= 0) arr.splice(i, 1);
      touch(s);
    },
    duplicateItem(s, a: PayloadAction<{ section: ListSection; id: string }>) {
      if (!s.content) return;
      const arr = list(s, a.payload.section);
      const i = arr.findIndex((x) => x.id === a.payload.id);
      if (i < 0) return;
      const copy = JSON.parse(JSON.stringify(arr[i])) as WithId;
      reId(copy);
      arr.splice(i + 1, 0, copy);
      touch(s);
    },
    moveItem(s, a: PayloadAction<{ section: ListSection; id: string; dir: Dir }>) {
      if (!s.content) return;
      const arr = list(s, a.payload.section);
      if (
        move(
          arr,
          arr.findIndex((x) => x.id === a.payload.id),
          a.payload.dir,
        )
      )
        touch(s);
    },

    /** Put the entries of a list in the given id order. Entries not named keep their relative order at the end. */
    setOrder(s, a: PayloadAction<{ section: 'skills' | 'projects'; ids: string[] }>) {
      if (!s.content) return;
      const arr = list(s, a.payload.section);
      const rank = new Map(a.payload.ids.map((id, i) => [id, i]));
      const sorted = [...arr].sort((x, y) => (rank.get(x.id) ?? 1e6) - (rank.get(y.id) ?? 1e6));
      arr.splice(0, arr.length, ...sorted);
      touch(s);
    },
    moveSection(s, a: PayloadAction<{ id: string; dir: Dir }>) {
      if (!s.content) return;
      const arr = s.content.sections;
      if (
        move(
          arr,
          arr.findIndex((x) => x.id === a.payload.id),
          a.payload.dir,
        )
      )
        touch(s);
    },
    reorderSections(s, a: PayloadAction<{ activeId: string; overId: string }>) {
      if (!s.content) return;
      const arr = s.content.sections;
      const from = arr.findIndex((x) => x.id === a.payload.activeId);
      const to = arr.findIndex((x) => x.id === a.payload.overId);
      if (from < 0 || to < 0 || from === to) return;
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      touch(s);
    },
    setSectionTitle(s, a: PayloadAction<{ id: string; title: string }>) {
      const sec = s.content?.sections.find((x) => x.id === a.payload.id);
      if (!sec) return;
      sec.title = a.payload.title;
      touch(s);
    },
    toggleSection(s, a: PayloadAction<string>) {
      const sec = s.content?.sections.find((x) => x.id === a.payload);
      if (!sec) return;
      sec.visible = !sec.visible;
      touch(s);
    },
    addCustomSection(s) {
      if (!s.content || s.content.custom.length >= 10) return;
      const id = newId();
      s.content.custom.push({
        id,
        title: 'Custom section',
        items: [{ id: newId(), heading: '', description: '' }],
      });
      s.content.sections.push({ id, type: 'custom', visible: true });
      touch(s);
    },
    updateCustomSection(s, a: PayloadAction<{ id: string; title: string }>) {
      const sec = s.content?.custom.find((x) => x.id === a.payload.id);
      if (!sec) return;
      sec.title = a.payload.title;
      touch(s);
    },
    removeCustomSection(s, a: PayloadAction<string>) {
      if (!s.content) return;
      s.content.custom = s.content.custom.filter((x) => x.id !== a.payload);
      s.content.sections = s.content.sections.filter((x) => x.id !== a.payload);
      touch(s);
    },
    addCustomItem(s, a: PayloadAction<string>) {
      const sec = s.content?.custom.find((x) => x.id === a.payload);
      if (!sec) return;
      sec.items.push({ id: newId(), heading: '', description: '' });
      touch(s);
    },
    updateCustomItem(
      s,
      a: PayloadAction<{ sectionId: string; id: string; patch: Partial<CustomItem> }>,
    ) {
      const item = s.content?.custom
        .find((x) => x.id === a.payload.sectionId)
        ?.items.find((i) => i.id === a.payload.id);
      if (!item) return;
      Object.assign(item, a.payload.patch);
      touch(s);
    },
    removeCustomItem(s, a: PayloadAction<{ sectionId: string; id: string }>) {
      const sec = s.content?.custom.find((x) => x.id === a.payload.sectionId);
      if (!sec) return;
      sec.items = sec.items.filter((i) => i.id !== a.payload.id);
      touch(s);
    },
  },
});

export const editorActions = editorSlice.actions;
export default editorSlice.reducer;
