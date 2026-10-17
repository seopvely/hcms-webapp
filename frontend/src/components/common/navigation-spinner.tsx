"use client";
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { PageSpinner } from "./page-spinner";

interface NavigationSpinnerContextType {
  startNavigation: () => void;
}

const NavigationSpinnerContext = createContext<NavigationSpinnerContextType>({
  startNavigation: () => {},
});

export function useNavigationSpinner() {
  return useContext(NavigationSpinnerContext);
}

export function NavigationSpinnerProvider({ children }: { children: React.ReactNode }) {
  const [isNavigating, setIsNavigating] = useState(false);
  const [delayPassed, setDelayPassed] = useState(false);
  const pathname = usePathname();
  const [prevPathname, setPrevPathname] = useState(pathname);

  const startNavigation = useCallback(() => {
    setDelayPassed(false);
    setIsNavigating(true);
  }, []);

  // When pathname changes, navigation is complete (state adjusted during render, not in an effect)
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setIsNavigating(false);
  }

  // Delay showing spinner to avoid flash on fast navigations
  useEffect(() => {
    if (!isNavigating) return;
    const timer = setTimeout(() => setDelayPassed(true), 150);
    return () => clearTimeout(timer);
  }, [isNavigating]);

  // Intercept click events on anchor tags to detect Link navigation
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      // In native Capacitor app, open external links in the system browser
      if (href.startsWith("http") || href.startsWith("https")) {
        if (Capacitor.isNativePlatform()) {
          e.preventDefault();
          window.open(href, "_system");
        }
        return;
      }

      // Skip hash links, blob links, new-tab links, same-page navigation, and
      // file downloads (/api/* such as ICS·첨부 — the pathname never changes, so the spinner would never stop)
      if (
        href.startsWith("#") ||
        href.startsWith("blob:") ||
        href.startsWith("/api/") ||
        anchor.hasAttribute("download") ||
        anchor.getAttribute("target") === "_blank" ||
        e.ctrlKey || e.metaKey || e.shiftKey ||
        href === pathname
      ) {
        return;
      }

      // Internal navigation detected
      startNavigation();
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [pathname, startNavigation]);

  return (
    <NavigationSpinnerContext.Provider value={{ startNavigation }}>
      {children}
      <PageSpinner show={isNavigating && delayPassed} />
    </NavigationSpinnerContext.Provider>
  );
}
