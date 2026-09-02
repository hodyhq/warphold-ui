import { useEffect, useState } from "react";
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router";
import App from "./App.jsx";
import { detectMode, type ModeInfo } from "./mode";
import { fleet } from "./api/fleet";
import { Button, Nav, type NavItem } from "./design/components";
import { Device } from "./pages/fleet/Device";
import { Devices } from "./pages/fleet/Devices";
import { Groups } from "./pages/fleet/Groups";
import { Login } from "./pages/fleet/Login";
import { Mark } from "./pages/fleet/Mark";
import { Overview } from "./pages/fleet/Overview";
import { Targets } from "./pages/fleet/Targets";
import { Placeholder } from "./pages/fleet/Placeholder";

const NAV: NavItem[] = [
  { to: "/fleet", label: "Overview" },
  { to: "/fleet/devices", label: "Devices" },
  { to: "/fleet/groups", label: "Groups" },
  { to: "/fleet/policies", label: "Policies" },
  { to: "/fleet/targets", label: "Targets" },
  { to: "/fleet/settings", label: "Settings" },
];

/** The nav entry a path belongs to: the longest `to` that prefixes it. */
function currentNav(pathname: string): string {
  let best = "";
  for (const item of NAV) {
    const on = pathname === item.to || pathname.startsWith(item.to + "/");
    if (on && item.to.length > best.length) {
      best = item.to;
    }
  }
  return best;
}

/**
 * The Kinetic shell from Main.dc.html: mark, wordmark, nav, fleet name and a
 * primary action, over the skewed panel that backs the Overview's left column.
 */
function FleetLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [fleetName, setFleetName] = useState("");

  useEffect(() => {
    // The settings endpoint arrives with Task 14; until then the header just
    // carries no fleet name. A 401 from any Fleet call sends the browser to
    // the login page from the client's response interceptor.
    fleet
      .settings()
      .then((s) => setFleetName(s.fleet_name ?? ""))
      .catch(() => setFleetName(""));
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      {pathname === "/fleet" && (
        <div
          aria-hidden="true"
          className="bg-panel pointer-events-none absolute top-0 left-[-120px] h-full w-[620px] -skew-x-12"
        />
      )}
      <header className="relative flex items-center gap-9 px-12 py-[22px]">
        <Link to="/fleet" className="flex items-center gap-[10px] text-inherit hover:text-inherit">
          <Mark />
          <span className="font-display text-[16px] font-extrabold tracking-[0.02em]">WARPHOLD</span>
        </Link>
        <Nav items={NAV} current={currentNav(pathname)} />
        <div className="grow" />
        {fleetName && <span className="text-dim font-mono text-[12px]">{fleetName}</span>}
        <Button variant="primary" onClick={() => navigate("/fleet/groups")}>
          Add device
        </Button>
      </header>
      <main className="relative min-h-0 grow px-12 pt-[22px] pb-8">
        <Outlet />
      </main>
    </div>
  );
}

function FleetRoutes({ activated }: { activated: boolean }) {
  return (
    <Routes>
      <Route path="/fleet/login" element={<Login />} />
      <Route
        path="/fleet/activate"
        element={<Placeholder title="Activate Fleet" note="The activation wizard lands in a later task." />}
      />
      {/* Before activation there is nothing to show but the wizard, so the
          whole shell is replaced by a redirect to it. */}
      <Route element={activated ? <FleetLayout /> : <Navigate to="/fleet/activate" replace />}>
        <Route path="/fleet" element={<Overview />} />
        <Route path="/fleet/devices" element={<Devices />} />
        <Route path="/fleet/devices/:id" element={<Device />} />
        <Route path="/fleet/groups" element={<Groups />} />
        <Route path="/fleet/policies" element={<Placeholder title="Policy templates" />} />
        <Route path="/fleet/targets" element={<Targets />} />
        <Route path="/fleet/settings" element={<Placeholder title="Settings" />} />
      </Route>
      <Route path="*" element={<Navigate to="/fleet" replace />} />
    </Routes>
  );
}

function AgentRoutes() {
  return (
    <Routes>
      <Route
        path="/agent"
        element={
          <div className="p-12">
            <Placeholder title="This device" note="The agent screen lands in a later task." />
          </div>
        }
      />
      <Route path="*" element={<Navigate to="/agent" replace />} />
    </Routes>
  );
}

/**
 * Top of the app. One bundle serves three products, so the mode is detected
 * from the server (see mode.ts) before anything renders: fleet gets the
 * Kinetic shell, agent gets the device screen, solo keeps the inherited
 * single-user app untouched (Task 15 restyles it) - including its own router.
 */
export function AppShell() {
  const [info, setInfo] = useState<ModeInfo | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    detectMode().then(
      (m) => live && setInfo(m),
      // detectMode only throws when the server could not answer at all; which
      // product this is stays unknown, so say so rather than render a guess.
      () => live && setUnreachable(true),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  if (unreachable) {
    return (
      <div className="wh flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="m-0">Cannot reach the WarpHold server.</p>
        <Button
          onClick={() => {
            setUnreachable(false);
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }
  if (!info) {
    return null;
  }
  if (info.mode === "solo") {
    return <App />;
  }
  return (
    <div className="wh">
      <BrowserRouter>
        {info.mode === "agent" ? <AgentRoutes /> : <FleetRoutes activated={info.activated} />}
      </BrowserRouter>
    </div>
  );
}

export default AppShell;
