import "./css/App.css";
import axios from "axios";
import clsx from "clsx";
import { React, Component } from "react";
import { BrowserRouter as Router, NavLink, Navigate, Route, Routes } from "react-router";
import { Policy } from "./pages/Policy";
import { Preferences } from "./pages/Preferences";
import { Policies } from "./pages/Policies";
import { Repository } from "./pages/Repository";
import { Task } from "./pages/Task";
import { Tasks } from "./pages/Tasks";
import { Snapshots } from "./pages/Snapshots";
import { SnapshotCreate } from "./pages/SnapshotCreate";
import { SnapshotDirectory } from "./pages/SnapshotDirectory";
import { SnapshotHistory } from "./pages/SnapshotHistory";
import { SnapshotRestore } from "./pages/SnapshotRestore";
import { Mark } from "./pages/fleet/Mark";
import { AppContext } from "./contexts/AppContext";
import { UIPreferenceProvider } from "./contexts/UIPreferencesContext";

/**
 * One nav entry. `requiresRepository` marks the tabs that only mean anything
 * once a repository is connected - Repository and Preferences stay reachable
 * so a disconnected install can be fixed from the UI.
 */
const NAV = [
  { to: "/snapshots", label: "Snapshots", testid: "tab-snapshots", requiresRepository: true },
  { to: "/policies", label: "Policies", testid: "tab-policies", requiresRepository: true },
  { to: "/tasks", label: "Tasks", testid: "tab-tasks", requiresRepository: true },
  { to: "/repo", label: "Repository", testid: "tab-repo" },
  { to: "/preferences", label: "Preferences", testid: "tab-preferences" },
];

export default class App extends Component {
  constructor() {
    super();

    this.state = {
      runningTaskCount: 0,
      isFetching: false,
      repoDescription: "",
      isRepositoryConnected: false,
    };

    this.fetchTaskSummary = this.fetchTaskSummary.bind(this);
    this.repositoryUpdated = this.repositoryUpdated.bind(this);
    this.repositoryDescriptionUpdated = this.repositoryDescriptionUpdated.bind(this);
    this.fetchInitialRepositoryDescription = this.fetchInitialRepositoryDescription.bind(this);

    const tok = document.head.querySelector('meta[name="kopia-csrf-token"]');
    if (tok && tok.content) {
      axios.defaults.headers.common["X-Kopia-Csrf-Token"] = tok.content;
    } else {
      axios.defaults.headers.common["X-Kopia-Csrf-Token"] = "-";
    }
  }

  componentDidMount() {
    const av = document.getElementById("appVersion");
    if (av) {
      // show app version after mounting the component to avoid flashing of unstyled content.
      av.style.display = "block";
    }

    this.fetchInitialRepositoryDescription();
    this.taskSummaryInterval = window.setInterval(this.fetchTaskSummary, 5000);
  }

  fetchInitialRepositoryDescription() {
    axios
      .get("/api/v1/repo/status")
      .then((result) => {
        this.setState({ isRepositoryConnected: result.data.connected });
        if (result.data.description) {
          this.setState({ repoDescription: result.data.description });
        }
      })
      .catch((_) => {
        /* ignore */
      });
  }

  fetchTaskSummary() {
    if (!this.state.isFetching) {
      this.setState({ isFetching: true });
      axios
        .get("/api/v1/tasks-summary")
        .then((result) => {
          this.setState({
            isFetching: false,
            runningTaskCount: result.data["RUNNING"] || 0,
          });
        })
        .catch((_) => {
          this.setState({ isFetching: false, runningTaskCount: -1 });
        });
    }
  }

  componentWillUnmount() {
    window.clearInterval(this.taskSummaryInterval);
  }

  // this is invoked via AppContext whenever repository is connected, disconnected, etc.
  repositoryUpdated(isConnected) {
    this.setState({ isRepositoryConnected: isConnected });
    if (isConnected) {
      window.location.replace("/snapshots");
    } else {
      window.location.replace("/repo");
    }
  }

  repositoryDescriptionUpdated(desc) {
    this.setState({
      repoDescription: desc,
    });
  }

  render() {
    const { uiPrefs, runningTaskCount, isRepositoryConnected } = this.state;

    return (
      <Router>
        <AppContext value={this}>
          <UIPreferenceProvider initalValue={uiPrefs}>
            <div className="wh flex min-h-screen flex-col">
              <header className="flex flex-wrap items-center gap-9 px-12 py-[22px]">
                <NavLink to="/snapshots" className="flex items-center gap-[10px] text-inherit hover:text-inherit">
                  <Mark />
                  <span className="font-display text-[16px] font-extrabold tracking-[0.02em]">WARPHOLD</span>
                </NavLink>
                <nav className="flex flex-wrap gap-[22px]">
                  {NAV.map((item) => {
                    const locked = item.requiresRepository && !isRepositoryConnected;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        data-testid={item.testid}
                        data-title={item.label}
                        // Bootstrap's `.disabled` link class is gone; the state
                        // it stood for is kept on the class list because the tab
                        // is still shown, just not usable, until a repository is
                        // connected. A locked tab is also taken out of the tab
                        // order and its activation cancelled, so the pointer and
                        // the keyboard reach the same dead end.
                        className={({ isActive }) =>
                          clsx(
                            "border-b-2 pb-1 text-[12px] font-medium tracking-[0.04em] uppercase",
                            locked
                              ? "disabled pointer-events-none border-transparent text-dim"
                              : isActive
                                ? "border-ember text-ink"
                                : "border-transparent text-muted hover:text-ink",
                          )
                        }
                        aria-disabled={locked ? "true" : undefined}
                        tabIndex={locked ? -1 : undefined}
                        onClick={locked ? (e) => e.preventDefault() : undefined}
                        title={locked ? "Repository is not connected" : undefined}
                      >
                        {item.label}
                        {item.testid === "tab-tasks" && runningTaskCount > 0 && <>({runningTaskCount})</>}
                      </NavLink>
                    );
                  })}
                </nav>
                <div className="grow" />
                {this.state.repoDescription && (
                  <NavLink to="/repo" className="font-mono text-[12px] text-dim hover:text-ink">
                    {this.state.repoDescription}
                  </NavLink>
                )}
              </header>

              <main className="min-h-0 grow px-12 pt-[22px] pb-8">
                <Routes>
                  <Route path="snapshots" element={<Snapshots />} />
                  <Route path="snapshots/new" element={<SnapshotCreate />} />
                  <Route path="snapshots/single-source/" element={<SnapshotHistory />} />
                  <Route path="snapshots/dir/:oid/restore" element={<SnapshotRestore />} />
                  <Route path="snapshots/dir/:oid" element={<SnapshotDirectory />} />
                  <Route path="policies/edit/" element={<Policy />} />
                  <Route path="policies" element={<Policies />} />
                  <Route path="tasks/:tid" element={<Task />} />
                  <Route path="tasks" element={<Tasks />} />
                  <Route path="repo" element={<Repository />} />
                  <Route path="preferences" element={<Preferences />} />
                  <Route path="/" element={<Navigate to="/snapshots" />} />
                </Routes>
              </main>
            </div>
          </UIPreferenceProvider>
        </AppContext>
      </Router>
    );
  }
}
