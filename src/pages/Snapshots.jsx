import { faSync, faUserFriends } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import axios from "axios";
import moment from "moment";
import React, { Component } from "react";
import { Button, Eyebrow, Pill, Select, Spinner } from "../design/components";
import { Link } from "react-router";
import KopiaTable from "../components/KopiaTable";
import { compare, formatOwnerName, sizeDisplayName } from "../utils/formatutils";
import { errorAlert, redirect, sizeWithFailures } from "../utils/uiutil";
import { policyEditorURL, sourceQueryStringParams } from "../utils/policyutil";
import { CLIEquivalent } from "../components/CLIEquivalent";
import { UIPreferencesContext } from "../contexts/UIPreferencesContext";

/** The `Button` look, for the links that have to stay anchors. */
const LINK_BUTTON =
  "inline-block cursor-pointer rounded-sm border border-line-strong bg-transparent px-[14px] py-[9px] " +
  "text-[12px] font-semibold tracking-[0.06em] text-ink uppercase hover:border-ink-soft hover:text-ink";
const PRIMARY_LINK_BUTTON =
  "inline-block cursor-pointer rounded-sm border border-ember bg-ember px-[14px] py-[9px] text-[12px] " +
  "font-semibold tracking-[0.06em] text-ground uppercase hover:border-ember-soft hover:bg-ember-soft hover:text-ground";

const localSnapshots = "Local Snapshots";
const allSnapshots = "All Snapshots";

export class Snapshots extends Component {
  constructor() {
    super();
    this.state = {
      sources: [],
      isLoading: true,
      isFetching: false,
      isRefreshing: false,
      error: null,

      localSourceName: "",
      multiUser: false,
      selectedOwner: null,
      selectedDirectory: "",
    };

    this.sync = this.sync.bind(this);
    this.fetchSourcesWithoutSpinner = this.fetchSourcesWithoutSpinner.bind(this);

    this.cancelSnapshot = this.cancelSnapshot.bind(this);
    this.startSnapshot = this.startSnapshot.bind(this);
  }

  componentDidMount() {
    const { defaultSnapshotViewAll } = this.context;
    // Context is not available early enough in the constructor for preference-driven defaults.
    // eslint-disable-next-line @eslint-react/no-set-state-in-component-did-mount -- needs this.context
    this.setState({
      selectedOwner: defaultSnapshotViewAll ? allSnapshots : localSnapshots,
    });
    this.fetchSourcesWithoutSpinner();
    this.interval = window.setInterval(this.fetchSourcesWithoutSpinner, 3000);
  }

  componentWillUnmount() {
    window.clearInterval(this.interval);
  }

  fetchSourcesWithoutSpinner() {
    if (!this.state.isFetching) {
      this.setState({
        isFetching: true,
      });
      axios
        .get("/api/v1/sources")
        .then((result) => {
          this.setState({
            localSourceName: result.data.localUsername + "@" + result.data.localHost,
            multiUser: result.data.multiUser,
            sources: result.data.sources,
            isLoading: false,
            isFetching: false,
            isRefreshing: false,
          });
        })
        .catch((error) => {
          redirect(error);
          this.setState({
            error,
            isRefreshing: false,
            isFetching: false,
            isLoading: false,
          });
        });
    }
  }

  selectOwner(owner) {
    const { setDefaultSnapshotViewAll } = this.context;
    this.setState({ selectedOwner: owner });
    if (owner === localSnapshots) {
      setDefaultSnapshotViewAll(false);
    } else if (owner === allSnapshots) {
      setDefaultSnapshotViewAll(true);
    }
  }

  sync() {
    this.setState({ isRefreshing: true });
    axios
      .post("/api/v1/repo/sync", {})
      .then((_result) => {
        this.fetchSourcesWithoutSpinner();
      })
      .catch((error) => {
        errorAlert(error);
        this.setState({
          error,
          isRefreshing: false,
        });
      });
  }

  /**
   * Sets the header of an cell dynamically based on it's status
   * @param x - the cell which status is interpreted
   * @returns - the header of the cell
   */
  setHeader(x) {
    switch (x.cell.getValue()) {
      case "IDLE":
      case "PAUSED":
        return (x.cell.column.Header = "Actions");
      case "PENDING":
      case "UPLOADING":
        return (x.cell.column.Header = "Status");
      default:
        return (x.cell.column.Header = "");
    }
  }

  /**
   * Sets the content an cell dynamically based on it's status
   * @param x - the cell which content is changed
   * @returns - the content of the cell
   */
  statusCell(x, parent, bytesStringBase2) {
    this.setHeader(x);
    switch (x.cell.getValue()) {
      case "IDLE":
      case "PAUSED":
        return (
          <div className="flex flex-wrap gap-2">
            <Link data-testid="edit-policy" to={policyEditorURL(x.row.original.source)} className={LINK_BUTTON}>
              Policy
            </Link>
            <Button
              data-testid="snapshot-now"
              variant="primary"
              onClick={() => {
                parent.startSnapshot(x.row.original.source);
              }}
            >
              Snapshot Now
            </Button>
          </div>
        );

      case "PENDING":
        return (
          <span className="inline-flex items-center gap-2">
            <Spinner
              data-testid="snapshot-pending"
              size={14}
              title="Snapshot will start after the previous snapshot completes"
            />
            Pending
          </span>
        );

      case "UPLOADING": {
        let u = x.row.original.upload;
        let title = "";
        let totals = "";
        if (u) {
          title =
            " hashed " +
            u.hashedFiles +
            " files (" +
            sizeDisplayName(u.hashedBytes, bytesStringBase2) +
            ")\n" +
            " cached " +
            u.cachedFiles +
            " files (" +
            sizeDisplayName(u.cachedBytes, bytesStringBase2) +
            ")\n" +
            " dir " +
            u.directory;

          const totalBytes = u.hashedBytes + u.cachedBytes;

          totals = sizeDisplayName(totalBytes, bytesStringBase2);
          if (u.estimatedBytes) {
            totals += "/" + sizeDisplayName(u.estimatedBytes, bytesStringBase2);

            const percent = Math.round((totalBytes * 1000.0) / u.estimatedBytes) / 10.0;
            if (percent <= 100) {
              totals += " " + percent + "%";
            }
          }
        }

        return (
          <span className="inline-flex items-center gap-2">
            <Spinner data-testid="snapshot-uploading" size={14} title={title} />
            <span className="font-mono text-ember">{totals}</span>
            {x.row.original.currentTask && <Link to={"/tasks/" + x.row.original.currentTask}>Details</Link>}
          </span>
        );
      }

      default:
        return "";
    }
  }

  cancelSnapshot(source) {
    axios
      .post("/api/v1/sources/cancel?" + sourceQueryStringParams(source), {})
      .then((_result) => {
        this.fetchSourcesWithoutSpinner();
      })
      .catch((error) => {
        errorAlert(error);
      });
  }

  startSnapshot(source) {
    axios
      .post("/api/v1/sources/upload?" + sourceQueryStringParams(source), {})
      .then((_result) => {
        this.fetchSourcesWithoutSpinner();
      })
      .catch((error) => {
        errorAlert(error);
      });
  }

  nextSnapshotTimeCell(x) {
    if (!x.cell.getValue()) {
      if (x.row.original.status === "PAUSED") {
        return "paused";
      }

      return "";
    }

    if (x.row.original.status === "UPLOADING") {
      return "";
    }

    return (
      <span className="inline-flex items-center gap-2" title={moment(x.cell.getValue()).toLocaleString()}>
        {moment(x.cell.getValue()).fromNow()}
        {moment(x.cell.getValue()).isBefore(moment()) && <Pill tone="warn">overdue</Pill>}
      </span>
    );
  }

  render() {
    let { sources, isLoading, error } = this.state;
    const { bytesStringBase2 } = this.context;
    if (error) {
      return <p>{error.message}</p>;
    }
    if (isLoading) {
      return <Spinner size={24} />;
    }
    let uniqueOwners = sources.reduce((a, d) => {
      const owner = formatOwnerName(d.source);

      if (!a.includes(owner)) {
        a.push(owner);
      }
      return a;
    }, []);

    uniqueOwners.sort();

    switch (this.state.selectedOwner) {
      case allSnapshots:
        // do nothing;
        break;

      case localSnapshots:
        sources = sources.filter((x) => formatOwnerName(x.source) === this.state.localSourceName);
        break;

      default:
        sources = sources.filter((x) => formatOwnerName(x.source) === this.state.selectedOwner);
        break;
    }

    const columns = [
      {
        id: "path",
        header: "Path",
        accessorFn: (x) => x.source,
        sortType: (a, b) => {
          const v = compare(a.original.source.path, b.original.source.path);
          if (v !== 0) {
            return v;
          }

          return compare(formatOwnerName(a.original.source), formatOwnerName(b.original.source));
        },
        width: "",
        cell: (x) => (
          <Link to={"/snapshots/single-source?" + sourceQueryStringParams(x.cell.getValue())}>
            {x.cell.getValue().path}
          </Link>
        ),
      },
      {
        id: "owner",
        header: "Owner",
        accessorFn: (x) => x.source.userName + "@" + x.source.host,
        width: 250,
      },
      {
        id: "lastSnapshotSize",
        header: "Size",
        width: 120,
        accessorFn: (x) => x.lastSnapshot?.stats?.totalSize ?? 0,
        cell: (x) =>
          sizeWithFailures(x.cell.getValue(), x.row.original.lastSnapshot?.rootEntry?.summ ?? null, bytesStringBase2),
      },
      {
        id: "lastSnapshotTime",
        header: "Last Snapshot",
        width: 160,
        accessorFn: (x) => (x.lastSnapshot ? x.lastSnapshot.startTime : null),
        cell: (x) =>
          x.cell.getValue() ? (
            <span title={moment(x.cell.getValue()).toLocaleString()}>{moment(x.cell.getValue()).fromNow()}</span>
          ) : (
            ""
          ),
      },
      {
        id: "nextSnapshotTime",
        header: "Next Snapshot",
        width: 160,
        accessorFn: (x) => x.nextSnapshotTime,
        cell: (x) => this.nextSnapshotTimeCell(x),
      },
      {
        id: "status",
        header: "",
        width: 300,
        accessorFn: (x) => x.status,
        cell: (x) => this.statusCell(x, this, bytesStringBase2),
      },
    ];

    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-6 border-b border-line-strong pb-3">
          <div>
            <Eyebrow>This machine · {sources.length} sources</Eyebrow>
            <h1 className="font-display m-0 mt-2 text-[36px] leading-none font-extrabold tracking-[-0.02em]">
              Sources
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {this.state.multiUser && (
              <label className="flex items-center gap-2">
                <FontAwesomeIcon icon={faUserFriends} className="text-muted" aria-hidden="true" />
                <span className="sr-only">Show snapshots of</span>
                <Select
                  className="py-[6px] text-[12px]"
                  value={this.state.selectedOwner ?? localSnapshots}
                  onChange={(e) => this.selectOwner(e.target.value)}
                >
                  <option value={localSnapshots}>{localSnapshots}</option>
                  <option value={allSnapshots}>{allSnapshots}</option>
                  {uniqueOwners.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <Button title="Synchronize" aria-label="Synchronize" onClick={this.sync} disabled={this.state.isRefreshing}>
              {this.state.isRefreshing ? <Spinner size={12} /> : <FontAwesomeIcon icon={faSync} />}
            </Button>
            {/* An anchor, not a button: the upstream e2e clicks a[data-testid='new-snapshot']. */}
            <a data-testid="new-snapshot" href="/snapshots/new" className={PRIMARY_LINK_BUTTON}>
              New Snapshot
            </a>
          </div>
        </div>

        <KopiaTable data={sources} columns={columns} />
        <CLIEquivalent command={`snapshot list`} />
      </div>
    );
  }
}
Snapshots.contextType = UIPreferencesContext;
