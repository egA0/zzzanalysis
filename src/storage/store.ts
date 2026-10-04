import { create } from "zustand";
import { initialData } from "../domain/data";
import type { AppData } from "../domain/types";
import { loadData, saveData } from "./data";

type Store = {
  data: AppData;
  ready: boolean;
  error: string;
  update: (change: (data: AppData) => void) => void;
  replace: (data: AppData) => void;
  hydrate: () => Promise<void>;
  setError: (error: string) => void;
};
export const useApp = create<Store>((set, get) => ({
  data: initialData(),
  ready: false,
  error: "",
  update: (change) => {
    const data = structuredClone(get().data);
    change(data);
    set({ data });
    void saveData(data).catch((e) => set({ error: `保存失败：${String(e)}` }));
  },
  replace: (data) => {
    set({ data });
    void saveData(data).catch((e) => set({ error: `保存失败：${String(e)}` }));
  },
  hydrate: async () => {
    try {
      const data = await loadData();
      set({ data: data ?? get().data, ready: true });
    } catch (e) {
      set({ ready: true, error: `读取本地数据失败：${String(e)}` });
    }
  },
  setError: (error) => set({ error }),
}));
