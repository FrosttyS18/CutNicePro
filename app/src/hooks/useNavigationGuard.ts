import { createContext, useContext } from "react";
import type { NavigationGuard } from "../lib/navigation-guard";

export const NavigationGuardContext = createContext<NavigationGuard | null>(null);
export function useNavigationGuard(): NavigationGuard | null { return useContext(NavigationGuardContext); }
