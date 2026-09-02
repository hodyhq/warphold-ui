import { faInfoCircle, faStopCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import axios from "axios";
import moment from "moment";
import React, { Component } from "react";
import { Button, Card, Eyebrow, Input, Select } from "../design/components";
import { Col, Row } from "../components/Layout";
import { Link } from "react-router";
import PropTypes from "prop-types";
import { handleChange } from "../forms";
import KopiaTable from "../components/KopiaTable";
import { Logs } from "../components/Logs";
import { formatDuration, sizeDisplayName } from "../utils/formatutils";
import { redirect } from "../utils/uiutil";
import { cancelTask, taskStatusSymbol } from "../utils/taskutil";
import { UIPreferencesContext } from "../contexts/UIPreferencesContext";

/**
 * How far a running task has got, from the counters the server already
 * reports. Snapshot uploads publish "Processed Bytes" against
 * "Estimated Bytes" (see snapshot/upload/upload_progress.go); tasks that
 * publish neither - maintenance, say - get no percentage and no bar, only
 * the server's own progressInfo line.
 */
function taskProgress(task) {
  const done = task.counters?.["Processed Bytes"]?.value;
  const total = task.counters?.["Estimated Bytes"]?.value;
  if (!done || !total) {
    return null;
  }
  return { done, total, percent: Math.min(100, Math.round((done * 100) / total)) };
}

/** The card Solo.dc.html puts above the list for whatever is running now. */
function RunningTask({ task, bytesStringBase2 }) {
  const progress = taskProgress(task);

  return (
    <Card data-testid="running-task" className="gap-[10px] border-ember">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-semibold">
          {task.kind} {task.description}
        </span>
        <span className="flex items-center gap-[14px]">
          <span className="font-mono text-[12px] text-ember">
            {progress ? progress.percent + "% · " : ""}
            {formatDuration(task.startTime, null, true)} elapsed
          </span>
          <Button onClick={() => cancelTask(task.id)}>
            <FontAwesomeIcon icon={faStopCircle} /> Cancel
          </Button>
        </span>
      </div>
      {progress ? (
        <>
          <div className="h-[6px] overflow-hidden rounded-[3px] bg-line">
            <div
              role="progressbar"
              aria-label={"Progress of " + task.description}
              aria-valuenow={progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-full bg-ember"
              style={{ width: progress.percent + "%" }}
            />
          </div>
          <span className="font-mono text-[12px] text-muted">
            {sizeDisplayName(progress.done, bytesStringBase2)} of {sizeDisplayName(progress.total, bytesStringBase2)}
          </span>
        </>
      ) : (
        task.progressInfo && <span className="font-mono text-[12px] text-muted">{task.progressInfo}</span>
      )}
      <Logs taskID={task.id} className="max-h-[140px]" />
    </Card>
  );
}

RunningTask.propTypes = {
  task: PropTypes.object.isRequired,
  bytesStringBase2: PropTypes.bool,
};

export class Tasks extends Component {
  constructor() {
    super();
    this.state = {
      items: [],
      isLoading: true,
      error: null,
      showKind: "All",
      showStatus: "All",
      uniqueKinds: [],
      searchDescription: "",
    };

    this.handleChange = handleChange.bind(this);
    this.fetchTasks = this.fetchTasks.bind(this);
    this.interval = window.setInterval(this.fetchTasks, 3000);
  }

  componentDidMount() {
    this.fetchTasks();
  }

  componentWillUnmount() {
    window.clearInterval(this.interval);
  }

  getUniqueKinds(tasks) {
    let o = {};

    for (const tsk of tasks) {
      o[tsk.kind] = true;
    }

    let result = [];
    for (const kind in o) {
      result.push(kind);
    }

    return result;
  }

  fetchTasks() {
    axios
      .get("/api/v1/tasks")
      .then((result) => {
        this.setState({
          items: result.data.tasks,
          uniqueKinds: this.getUniqueKinds(result.data.tasks),
          isLoading: false,
        });
      })
      .catch((error) => {
        redirect(error);
        this.setState({
          error,
          isLoading: false,
        });
      });
  }

  /**
   * `ignoreStatus` is for the running-task cards: they are the "what is
   * happening now" band, so the status filter does not apply to them, but the
   * kind and description filters still do.
   */
  taskMatches(t, ignoreStatus = false) {
    if (this.state.showKind !== "All" && t.kind !== this.state.showKind) {
      return false;
    }

    if (
      !ignoreStatus &&
      this.state.showStatus !== "All" &&
      t.status.toLowerCase() !== this.state.showStatus.toLowerCase()
    ) {
      return false;
    }

    if (this.state.searchDescription && t.description.indexOf(this.state.searchDescription) < 0) {
      return false;
    }

    return true;
  }

  filterItems(items) {
    return items.filter((c) => this.taskMatches(c));
  }

  render() {
    const { items, isLoading, error } = this.state;
    if (error) {
      return <p>{error.message}</p>;
    }
    if (isLoading) {
      return <p>Loading ...</p>;
    }

    const columns = [
      {
        header: "Start Time",
        width: 160,
        cell: (x) => (
          <Link to={"/tasks/" + x.row.original.id} title={moment(x.row.original.startTime).toLocaleString()}>
            {moment(x.row.original.startTime).fromNow()}
          </Link>
        ),
      },
      {
        header: "Status",
        width: 240,
        cell: (x) => taskStatusSymbol(x.row.original),
      },
      {
        header: "Kind",
        width: "",
        cell: (x) => <span>{x.row.original.kind}</span>,
      },
      {
        header: "Description",
        width: "",
        cell: (x) => <span>{x.row.original.description}</span>,
      },
    ];

    const running = items.filter((t) => t.status === "RUNNING" && this.taskMatches(t, true));
    // Running tasks are shown as cards above, so the table below is the
    // finished ones - unless the status filter explicitly asks for running.
    const filteredItems = this.filterItems(
      this.state.showStatus === "All" ? items.filter((t) => !running.includes(t)) : items,
    );

    return (
      <div className="flex flex-col gap-4">
        <div>
          <Eyebrow>Tasks</Eyebrow>
          <h1 className="font-display m-0 mt-2 text-[36px] leading-none font-extrabold tracking-[-0.02em]">
            {running.length} running
          </h1>
        </div>
        <Row className="items-end">
          <Col xs="auto">
            <label className="flex flex-col gap-[6px]">
              <Eyebrow>Status</Eyebrow>
              <Select
                className="py-[6px] text-[12px]"
                value={this.state.showStatus}
                onChange={(e) => this.setState({ showStatus: e.target.value })}
              >
                <option value="All">All</option>
                <option value="Running">Running</option>
                <option value="Failed">Failed</option>
              </Select>
            </label>
          </Col>
          <Col xs="auto">
            <label className="flex flex-col gap-[6px]">
              <Eyebrow>Kind</Eyebrow>
              <Select
                className="py-[6px] text-[12px]"
                value={this.state.showKind}
                onChange={(e) => this.setState({ showKind: e.target.value })}
              >
                <option value="All">All</option>
                {this.state.uniqueKinds.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            </label>
          </Col>
          <Col>
            <label className="flex flex-col gap-[6px]">
              <Eyebrow>Search</Eyebrow>
              <Input
                type="text"
                name="searchDescription"
                placeholder="case-sensitive search description"
                value={this.state.searchDescription}
                onChange={this.handleChange}
                autoFocus={true}
              />
            </label>
          </Col>
        </Row>
        {running.map((t) => (
          <RunningTask key={t.id} task={t} bytesStringBase2={this.context.bytesStringBase2} />
        ))}
        {!items.length ? (
          <Card>
            <span className="text-muted">
              <FontAwesomeIcon icon={faInfoCircle} /> A list of tasks will appear here when you create snapshots,
              restore, run maintenance, etc.
            </span>
          </Card>
        ) : (
          <KopiaTable data={filteredItems} columns={columns} />
        )}
      </div>
    );
  }
}

// The running-task card shows byte counts, so it needs the byte-base preference.
Tasks.contextType = UIPreferencesContext;
