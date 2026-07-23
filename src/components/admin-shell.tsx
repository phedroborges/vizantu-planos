"use client";

import { BarChart3, CalendarDays, Files, Menu, Plus, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

export function AdminShell({
  active,
  children,
}: {
  active: "dashboard" | "plans" | "calendar";
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="admin-shell">
      <button
        className={`admin-menu-backdrop ${menuOpen ? "visible" : ""}`}
        type="button"
        aria-label="Fechar menu"
        onClick={() => setMenuOpen(false)}
      />
      <aside className={`admin-sidebar ${menuOpen ? "open" : ""}`} aria-label="Navegação administrativa">
        <div className="admin-brand">
          <Image src="/brand/vizantu-white.svg" width={1518} height={296} alt="Vizantu" priority />
          <button type="button" className="admin-menu-close" aria-label="Fechar menu" onClick={() => setMenuOpen(false)}><X size={19} /></button>
        </div>
        <div className="admin-product">
          <span>Central de planos</span>
          <small>Gestão e aprovações</small>
        </div>
        <nav className="admin-nav">
          <Link className={active === "dashboard" ? "active" : ""} href="/" onClick={() => setMenuOpen(false)}>
            <BarChart3 size={18} />
            <span>Dashboard</span>
          </Link>
          <Link className={active === "plans" ? "active" : ""} href="/planos" onClick={() => setMenuOpen(false)}>
            <Files size={18} />
            <span>Planos</span>
          </Link>
          <Link className={active === "calendar" ? "active" : ""} href="/calendario" onClick={() => setMenuOpen(false)}>
            <CalendarDays size={18} />
            <span>Calendário</span>
          </Link>
        </nav>
        <p className="admin-sidebar-note">Acompanhe decisões, responsáveis e versões em um só lugar.</p>
      </aside>
      <div className="admin-main">
        <header className="admin-mobile-bar">
          <button type="button" aria-label="Abrir menu" onClick={() => setMenuOpen(true)}><Menu size={21} /></button>
          <Image className="admin-mobile-logo" src="/brand/vizantu-dark.svg" width={1518} height={296} alt="Vizantu" priority />
          <Link href="/planos#novo-plano" aria-label="Publicar novo plano"><Plus size={19} /></Link>
        </header>
        {children}
      </div>
    </div>
  );
}
