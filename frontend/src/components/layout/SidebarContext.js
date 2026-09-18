import { createContext, useContext } from "react";

// Contexte interne à la sidebar : évite de faire transiter ~15 props par entrée de nav.
export const SidebarContext = createContext(null);
export const useSidebar = () => useContext(SidebarContext);
