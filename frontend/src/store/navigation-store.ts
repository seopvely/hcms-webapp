import { create } from "zustand";

interface Breadcrumb {
  label: string;
  href?: string;
}

interface NavigationState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  pageTitle: string;
  setPageTitle: (title: string) => void;
  breadcrumbs: Breadcrumb[];
  setBreadcrumbs: (breadcrumbs: Breadcrumb[]) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  pageTitle: "",
  setPageTitle: (pageTitle) => set({ pageTitle }),
  breadcrumbs: [],
  setBreadcrumbs: (breadcrumbs) => set({ breadcrumbs }),
}));
