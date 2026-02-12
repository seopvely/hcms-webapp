"use client";
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
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
  const [showSpinner, setShowSpinner] = useState(false);
  const pathname = usePathname();

  const startNavigation = useCallback(() => {
    setIsNavigating(true);
  }, []);

  // When pathname changes, navigation is complete
  useEffect(() => {
    setIsNavigating(false);
    setShowSpinner(false);
  }, [pathname]);

  // Delay showing spinner to avoid flash on fast navigations
  useEffect(() => {
    if (!isNavigating) {
      setShowSpinner(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowSpinner(true);
    }, 150);
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

      // Skip external links, hash links, and same-page navigation
      if (href.startsWith("http") || href.startsWith("#") || href === pathname) {
        return;
      }

      // Internal navigation detected
      setIsNavigating(true);
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [pathname]);

  return (
    <NavigationSpinnerContext.Provider value={{ startNavigation }}>
      {children}
      <PageSpinner show={showSpinner} />
    </NavigationSpinnerContext.Provider>
  );
}
