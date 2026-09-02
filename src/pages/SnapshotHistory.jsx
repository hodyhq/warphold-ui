import axios from "axios";
import React, { Component, use } from "react";
import { Button, Checkbox, Dialog, Eyebrow, Field, Input, inputClass, Pill, Spinner } from "../design/components";
import { Link, useNavigate, useLocation } from "react-router";
import KopiaTable from "../components/KopiaTable";
import { CLIEquivalent } from "../components/CLIEquivalent";
import { compare, objectLink, parseQuery, rfc3339TimestampForDisplay } from "../utils/formatutils";
import { errorAlert, redirect, sizeWithFailures } from "../utils/uiutil";
import { sourceQueryStringParams } from "../utils/policyutil";
import { GoBackButton } from "../components/GoBackButton";
import { faSync, faThumbtack } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileAlt } from "@fortawesome/free-regular-svg-icons";
import { UIPreferencesContext } from "../contexts/UIPreferencesContext";
import PropTypes from "prop-types";

/**
 * Retention reason to pill tone. The palette only carries good/warn/bad, so
 * the distinction that matters is kept: "latest" reads as the live one, the
 * long-horizon rules as warnings, everything else neutral.
 */
function pillTone(tag) {
  if (tag.startsWith("latest-")) {
    return "good";
  }
  if (tag.startsWith("monthly-") || tag.startsWith("annual-")) {
    return "warn";
  }
  return "ink";
}

class SnapshotHistoryInternal extends Component {
  constructor() {
    super();
    this.state = {
      snapshots: [],
      showHidden: false,
      isLoading: true,
      isRefreshing: false,
      error: null,
      selectedSnapshotManifestIDs: {},
    };

    this.fetchSnapshots = this.fetchSnapshots.bind(this);
    this.toggleShowHidden = this.toggleShowHidden.bind(this);
    this.isSelected = this.isSelected.bind(this);
    this.toggleSelected = this.toggleSelected.bind(this);
    this.selectAll = this.selectAll.bind(this);
    this.deselectAll = this.deselectAll.bind(this);
    this.showDeleteConfirm = this.showDeleteConfirm.bind(this);
    this.deleteSelectedSnapshots = this.deleteSelectedSnapshots.bind(this);
    this.cancelDelete = this.cancelDelete.bind(this);
    this.deleteSnapshotSource = this.deleteSnapshotSource.bind(this);

    this.cancelSnapshotDescription = this.cancelSnapshotDescription.bind(this);
    this.removeSnapshotDescription = this.removeSnapshotDescription.bind(this);
    this.saveSnapshotDescription = this.saveSnapshotDescription.bind(this);

    this.editPin = this.editPin.bind(this);
    this.cancelPin = this.cancelPin.bind(this);
    this.savePin = this.savePin.bind(this);
    this.removePin = this.removePin.bind(this);

    this.editSnapshots = this.editSnapshots.bind(this);
  }

  selectAll() {
    let snapIds = {};
    for (const sn of this.state.snapshots) {
      snapIds[sn.id] = true;
    }

    this.setState({
      selectedSnapshotManifestIDs: snapIds,
    });
  }

  deselectAll() {
    this.setState({
      selectedSnapshotManifestIDs: {},
    });
  }

  isSelected(snap) {
    return !!this.state.selectedSnapshotManifestIDs[snap.id];
  }

  toggleSelected(snap) {
    let sel = { ...this.state.selectedSnapshotManifestIDs };

    if (sel[snap.id]) {
      delete sel[snap.id];
    } else {
      sel[snap.id] = true;
    }

    this.setState({
      selectedSnapshotManifestIDs: sel,
    });
  }

  componentDidUpdate(oldProps, oldState) {
    if (this.state.showHidden !== oldState.showHidden) {
      this.fetchSnapshots();
    }
  }

  componentDidMount() {
    this.fetchSnapshots();
  }

  showDeleteConfirm() {
    this.setState({
      alsoDeleteSource: false,
      showDeleteConfirmationDialog: true,
    });
  }

  deleteSelectedSnapshots() {
    let req = {
      source: {
        host: this.state.host,
        userName: this.state.userName,
        path: this.state.path,
      },
      snapshotManifestIds: [],
      deleteSourceAndPolicy: this.state.alsoDeleteSource,
    };

    for (let id in this.state.selectedSnapshotManifestIDs) {
      req.snapshotManifestIds.push(id);
    }

    axios
      .post("/api/v1/snapshots/delete", req)
      .then((_result) => {
        if (req.deleteSourceAndPolicy) {
          this.props.navigate(-1);
        } else {
          this.fetchSnapshots();
        }
      })
      .catch((error) => {
        redirect(error);
        errorAlert(error);
      });

    this.setState({
      showDeleteConfirmationDialog: false,
    });
  }

  deleteSnapshotSource() {
    let req = {
      source: {
        host: this.state.host,
        userName: this.state.userName,
        path: this.state.path,
      },
      deleteSourceAndPolicy: true,
    };

    axios
      .post("/api/v1/snapshots/delete", req)
      .then((_result) => {
        this.props.navigate(-1);
      })
      .catch((error) => {
        redirect(error);
        errorAlert(error);
      });
  }

  cancelDelete() {
    this.setState({
      showDeleteConfirmationDialog: false,
    });
  }

  fetchSnapshots() {
    let q = parseQuery(this.props.location.search);

    this.setState({
      isRefreshing: true,
      host: q.host,
      userName: q.userName,
      path: q.path,
      hiddenCount: 0,
      selectedSnapshot: null,
    });

    let u = "/api/v1/snapshots?" + sourceQueryStringParams(q);

    if (this.state.showHidden) {
      u += "&all=1";
    }

    axios
      .get(u)
      .then((result) => {
        this.setState({
          snapshots: result.data.snapshots,
          selectedSnapshotManifestIDs: {},
          unfilteredCount: result.data.unfilteredCount,
          uniqueCount: result.data.uniqueCount,
          isLoading: false,
          isRefreshing: false,
        });
      })
      .catch((error) =>
        this.setState({
          error,
          isLoading: false,
          isRefreshing: false,
        }),
      );
  }

  toggleShowHidden(x) {
    this.setState({
      showHidden: x.target.checked,
    });
  }

  cancelSnapshotDescription() {
    this.setState({ editingDescriptionFor: false });
  }

  removeSnapshotDescription() {
    this.editSnapshots({
      snapshots: this.state.editingDescriptionFor,
      description: "",
    });
  }

  saveSnapshotDescription() {
    this.editSnapshots({
      snapshots: this.state.editingDescriptionFor,
      description: this.state.updatedSnapshotDescription,
    });
  }

  descriptionFor(x) {
    return (
      <a
        href="#top"
        onClick={(event) => {
          event.preventDefault();
          this.setState({
            editingDescriptionFor: [x.id],
            updatedSnapshotDescription: x.description,
            originalSnapshotDescription: x.description,
          });
        }}
        title={x.description + " - Click to update snapshot description."}
        className={x.description ? "text-warn" : "text-muted"}
      >
        <b>
          <FontAwesomeIcon icon={faFileAlt} />
        </b>
      </a>
    );
  }

  newPinFor(x) {
    return (
      <a
        href="#top"
        onClick={(event) => {
          event.preventDefault();

          this.setState({
            editPinFor: [x.id],
            originalPinName: "",
            newPinName: "do-not-delete",
          });
        }}
        title="Add a pin to protect snapshot from deletion"
      >
        <FontAwesomeIcon icon={faThumbtack} className="text-dim" />
      </a>
    );
  }

  editPin(snap, pin) {
    this.setState({
      editPinFor: [snap.id],
      originalPinName: pin,
      newPinName: pin,
    });
  }

  cancelPin() {
    this.setState({ editPinFor: undefined });
  }

  removePin(p) {
    this.editSnapshots({
      snapshots: this.state.editPinFor,
      removePins: [p],
    });
  }

  savePin() {
    this.editSnapshots({
      snapshots: this.state.editPinFor,
      addPins: [this.state.newPinName],
      removePins: [this.state.originalPinName],
    });
  }

  editSnapshots(req) {
    this.setState({ savingSnapshot: true });
    axios
      .post("/api/v1/snapshots/edit", req)
      .then((_resp) => {
        this.setState({
          editPinFor: undefined,
          editingDescriptionFor: undefined,
          savingSnapshot: false,
        });
        this.fetchSnapshots();
      })
      .catch((e) => {
        this.setState({
          editPinFor: undefined,
          editingDescriptionFor: undefined,
          savingSnapshot: false,
        });
        redirect(e);
        errorAlert(e);
      });
  }

  render() {
    let { snapshots, unfilteredCount, uniqueCount, isLoading, error } = this.state;
    const { bytesStringBase2 } = this.context;
    if (error) {
      return <p>{error.message}</p>;
    }

    if (isLoading && !snapshots) {
      return <Spinner size={24} />;
    }
    const searchParams = new URLSearchParams(window.location.search);
    const path = searchParams.get("path");

    snapshots.sort((a, b) => -compare(a.startTime, b.startTime));

    const columns = [
      {
        id: "selected",
        header: "Selected",
        width: 20,
        align: "center",
        cell: (x) => (
          <Checkbox
            aria-label={"Select snapshot " + x.row.original.id}
            checked={this.isSelected(x.row.original)}
            onChange={() => this.toggleSelected(x.row.original)}
          />
        ),
      },
      {
        id: "startTime",
        header: "Start time",
        width: 200,
        cell: (x) => {
          let timestamp = rfc3339TimestampForDisplay(x.row.original.startTime);
          return (
            <Link to={objectLink(x.row.original.rootID)} state={{ label: path }}>
              {timestamp}
            </Link>
          );
        },
      },
      {
        id: "description",
        header: "",
        width: 20,
        cell: (x) => this.descriptionFor(x.row.original),
      },
      {
        id: "rootID",
        header: "Root",
        width: "",
        accessorFn: (x) => x.rootID,
        cell: (x) => (
          <>
            <span className="font-mono text-[12px] font-bold">{x.cell.getValue()}</span>
            {x.row.original.description && <div className="text-[12px] text-muted">{x.row.original.description}</div>}
          </>
        ),
      },
      {
        header: "Retention",
        accessorFn: (x) => x.retention,
        width: "",
        cell: (x) => (
          <span className="flex flex-wrap items-center gap-[6px]">
            {x.cell.getValue().map((l) => (
              <Pill key={l} tone={pillTone(l)}>
                {l}
              </Pill>
            ))}
            {(x.row.original.pins || []).map((l) => (
              <button
                key={l}
                type="button"
                className="cursor-pointer border-0 bg-transparent p-0"
                title={"Edit pin " + l}
                onClick={() => this.editPin(x.row.original, l)}
              >
                <Pill tone="warn">
                  <FontAwesomeIcon icon={faThumbtack} /> {l}
                </Pill>
              </button>
            ))}
            {this.newPinFor(x.row.original)}
          </span>
        ),
      },
      {
        header: "Size",
        accessorFn: (x) => x.summary?.size ?? 0,
        width: 100,
        cell: (x) => sizeWithFailures(x.cell.getValue(), x.row.original.summary, bytesStringBase2),
      },
      {
        header: "Files",
        accessorFn: (x) => x.summary?.files ?? 0,
        width: 100,
      },
      {
        header: "Dirs",
        accessorFn: (x) => x.summary?.dirs ?? 0,
        width: 100,
      },
    ];

    const selectedElements = Object.keys(this.state.selectedSnapshotManifestIDs);

    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Snapshots of</Eyebrow>
            <h1 className="font-display m-0 mt-2 text-[28px] leading-none font-extrabold tracking-[-0.02em]">
              {this.state.path}
            </h1>
            <div className="mt-2 font-mono text-[12px] text-dim">
              <span>
                {this.state.userName}@{this.state.host}:{this.state.path}
              </span>{" "}
              ·{" "}
              <span>
                {/* The server omits unfilteredCount on some responses; "1 out of undefined" is not a count. */}
                {unfilteredCount != null && snapshots.length !== unfilteredCount
                  ? snapshots.length + " out of " + unfilteredCount
                  : snapshots.length}{" "}
                snapshots
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GoBackButton />
            {snapshots.length > 0 &&
              (selectedElements.length < snapshots.length ? (
                <Button onClick={this.selectAll}>Select All</Button>
              ) : (
                <Button onClick={this.deselectAll}>Deselect All</Button>
              ))}
            {selectedElements.length > 0 && (
              <Button variant="danger" onClick={this.showDeleteConfirm}>
                Delete Selected ({selectedElements.length})
              </Button>
            )}
            {snapshots.length === 0 && (
              <Button variant="danger" onClick={this.deleteSnapshotSource}>
                Delete Snapshot Source
              </Button>
            )}
            <Button
              title="Fetch snapshots"
              aria-label="Fetch snapshots"
              onClick={this.fetchSnapshots}
              disabled={this.state.isRefreshing}
            >
              {this.state.isRefreshing ? <Spinner size={12} /> : <FontAwesomeIcon icon={faSync} />}
            </Button>
          </div>
        </div>
        {unfilteredCount != null && unfilteredCount !== uniqueCount && (
          <Checkbox
            checked={this.state.showHidden}
            label={"Show " + unfilteredCount + " individual snapshots"}
            onChange={this.toggleShowHidden}
          />
        )}
        <KopiaTable data={snapshots} columns={columns} />

        <CLIEquivalent
          command={`snapshot list "${this.state.userName}@${this.state.host}:${this.state.path}"${this.state.showHidden ? " --show-identical" : ""}`}
        />

        <Dialog
          open={Boolean(this.state.showDeleteConfirmationDialog)}
          onClose={this.cancelDelete}
          title="Confirm Delete"
        >
          {selectedElements.length > 1 ? (
            <p className="m-0">
              Do you want to delete the selected <b>{selectedElements.length} snapshots</b>?
            </p>
          ) : (
            <p className="m-0">Do you want to delete the selected snapshot?</p>
          )}
          {selectedElements.length === snapshots.length && (
            <Checkbox
              label="Wipe all snapshots and the policy for this source."
              checked={this.state.alsoDeleteSource}
              onChange={() =>
                this.setState((state) => ({
                  alsoDeleteSource: !state.alsoDeleteSource,
                }))
              }
            />
          )}
          <div className="flex justify-end gap-3">
            <Button onClick={this.cancelDelete}>Cancel</Button>
            <Button variant="danger" onClick={this.deleteSelectedSnapshots}>
              Delete
            </Button>
          </div>
        </Dialog>

        <Dialog
          open={!!this.state.editingDescriptionFor}
          onClose={this.cancelSnapshotDescription}
          title="Snapshot Description"
        >
          <Field label="Enter new description">
            <textarea
              rows="4"
              className={inputClass}
              value={this.state.updatedSnapshotDescription}
              onChange={(e) => this.setState({ updatedSnapshotDescription: e.target.value })}
            />
          </Field>
          <div className="flex items-center justify-end gap-3">
            {this.state.savingSnapshot && <Spinner size={14} />}
            <Button onClick={this.cancelSnapshotDescription}>Cancel</Button>
            {this.state.originalSnapshotDescription && (
              <Button onClick={this.removeSnapshotDescription}>Remove Description</Button>
            )}
            <Button
              variant="primary"
              disabled={this.state.originalSnapshotDescription === this.state.updatedSnapshotDescription}
              onClick={this.saveSnapshotDescription}
            >
              Update Description
            </Button>
          </div>
        </Dialog>

        <Dialog open={!!this.state.editPinFor} onClose={this.cancelPin} title="Pin Snapshot">
          <Field label="Name of the pin">
            <Input value={this.state.newPinName} onChange={(e) => this.setState({ newPinName: e.target.value })} />
          </Field>
          <div className="flex items-center justify-end gap-3">
            {this.state.savingSnapshot && <Spinner size={14} />}
            <Button onClick={this.cancelPin}>Cancel</Button>
            {this.state.originalPinName && (
              <Button onClick={() => this.removePin(this.state.originalPinName)}>Remove Pin</Button>
            )}
            <Button
              variant="primary"
              onClick={this.savePin}
              disabled={this.state.newPinName === this.state.originalPinName || !this.state.newPinName}
            >
              {this.state.originalPinName ? "Update Pin" : "Add Pin"}
            </Button>
          </div>
        </Dialog>
      </div>
    );
  }
}

SnapshotHistoryInternal.propTypes = {
  host: PropTypes.string,
  userName: PropTypes.string,
  history: PropTypes.object,
  location: PropTypes.object,
  navigate: PropTypes.func,
};

export function SnapshotHistory(props) {
  const navigate = useNavigate();
  const location = useLocation();
  use(UIPreferencesContext);

  return <SnapshotHistoryInternal navigate={navigate} location={location} {...props} />;
}
