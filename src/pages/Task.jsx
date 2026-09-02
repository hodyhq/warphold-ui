import { faStopCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import axios from "axios";
import React, { Component, use } from "react";
import { Button, Card, Eyebrow, Input, Spinner } from "../design/components";
import { Col, Row } from "../components/Layout";
import { Logs } from "../components/Logs";
import { useNavigate, useLocation, useParams } from "react-router";
import { formatDuration, sizeDisplayName } from "../utils/formatutils";
import { redirect } from "../utils/uiutil";
import { GoBackButton } from "../components/GoBackButton";
import { cancelTask } from "../utils/taskutil";
import { UIPreferencesContext } from "../contexts/UIPreferencesContext";
import PropTypes from "prop-types";

class TaskInternal extends Component {
  constructor() {
    super();
    this.state = {
      items: [],
      isLoading: true,
      error: null,
      showLog: false,
    };

    this.taskID = this.taskID.bind(this);
    this.fetchTask = this.fetchTask.bind(this);

    // poll frequently, we will stop as soon as the task ends.
    this.interval = window.setInterval(() => this.fetchTask(), 500);
  }

  componentDidMount() {
    this.fetchTask();
  }

  componentWillUnmount() {
    if (this.interval) {
      window.clearInterval(this.interval);
    }
  }

  taskID(props) {
    return props.taskID || props.params.tid;
  }

  fetchTask() {
    axios
      .get("/api/v1/tasks/" + this.taskID(this.props))
      .then((result) => {
        this.setState({
          task: result.data,
          isLoading: false,
        });

        if (result.data.endTime) {
          window.clearInterval(this.interval);
          this.interval = null;
        }
      })
      .catch((error) => {
        redirect(error);
        this.setState({
          error,
          isLoading: false,
        });
      });
  }

  componentDidUpdate(prevProps) {
    if (this.taskID(prevProps) !== this.taskID(this.props)) {
      this.fetchTask();
    }
  }

  summaryControl(task) {
    const dur = formatDuration(task.startTime, task.endTime, true);

    switch (task.status) {
      case "SUCCESS":
        return (
          <Card>
            <span className="text-good">Task succeeded after {dur}.</span>
          </Card>
        );

      case "FAILED":
        return (
          <Card tone="bad">
            <span role="alert">
              <b>Error:</b> {task.errorMessage}.
            </span>
          </Card>
        );

      case "CANCELED":
        return (
          <Card tone="warn">
            <span>Task canceled.</span>
          </Card>
        );

      case "CANCELING":
        return (
          <Card tone="warn">
            <span className="flex items-center gap-2">
              <Spinner size={14} /> Canceling {dur}: {task.progressInfo}.
            </span>
          </Card>
        );

      default:
        return (
          <Card>
            <span className="flex items-center gap-2">
              <Spinner size={14} /> Running for {dur}: {task.progressInfo}.
            </span>
          </Card>
        );
    }
  }

  valueThreshold() {
    if (this.props.showZeroCounters) {
      return -1;
    }

    return 0;
  }

  counterBadge(label, c) {
    const value = c?.value ?? 0;
    if (value <= this.valueThreshold()) {
      return "";
    }

    let formatted = value.toLocaleString();
    if (c?.units === "bytes") {
      formatted = sizeDisplayName(value);
    }

    return (
      <tr key={label} className="border-b border-line">
        <td className="px-2 py-[8px]">{label}</td>
        <td className="px-2 py-[8px] text-right font-mono">{formatted}</td>
      </tr>
    );
  }

  counterLevelToSortOrder(l) {
    switch (l) {
      case "error":
        return 30;
      case "notice":
        return 10;
      case "warning":
        return 5;
      default:
        return 0;
    }
  }

  sortedBadges(counters) {
    let keys = Object.keys(counters);

    // sort keys by their level and the name alphabetically.
    keys.sort((a, b) => {
      const levelA = counters[a]?.level ?? "";
      const levelB = counters[b]?.level ?? "";
      if (levelA !== levelB) {
        return this.counterLevelToSortOrder(levelB) - this.counterLevelToSortOrder(levelA);
      }

      if (a < b) {
        return -1;
      }

      if (a > b) {
        return 1;
      }

      return 0;
    });

    return keys.map((c) => this.counterBadge(c, counters[c]));
  }

  render() {
    const { task, isLoading, error } = this.state;
    const { bytesStringBase2 } = this.context;
    if (error) {
      return <p>{error.message}</p>;
    }

    if (isLoading) {
      return <p>Loading ...</p>;
    }

    return (
      <div className="flex flex-col gap-4">
        {this.props.navigate && (
          <div className="flex flex-wrap items-center gap-3 border-b border-line-strong pb-3">
            <GoBackButton />
            {task.status === "RUNNING" && (
              <Button variant="danger" onClick={() => cancelTask(task.id)}>
                <FontAwesomeIcon icon={faStopCircle} /> Stop
              </Button>
            )}
            <h1 className="font-display m-0 text-[20px] leading-none font-extrabold tracking-[-0.02em]">
              {task.kind}: {task.description}
            </h1>
          </div>
        )}
        {this.summaryControl(task)}
        {task.counters && (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-left">
                <th className="px-2 py-[8px] font-normal">
                  <Eyebrow>Counter</Eyebrow>
                </th>
                <th className="px-2 py-[8px] text-right font-normal">
                  <Eyebrow>Value</Eyebrow>
                </th>
              </tr>
            </thead>
            <tbody>{this.sortedBadges(task.counters, bytesStringBase2)}</tbody>
          </table>
        )}
        <Row>
          <Col>
            <label className="flex flex-col gap-[6px]">
              <Eyebrow>Started</Eyebrow>
              <Input type="text" readOnly={true} value={new Date(task.startTime).toLocaleString()} />
            </label>
          </Col>
          <Col>
            <label className="flex flex-col gap-[6px]">
              <Eyebrow>Finished</Eyebrow>
              <Input type="text" readOnly={true} value={task.endTime ? new Date(task.endTime).toLocaleString() : "—"} />
            </label>
          </Col>
        </Row>
        <div className="flex flex-col gap-[6px]">
          <Eyebrow>Logs</Eyebrow>
          <Logs taskID={this.taskID(this.props)} />
        </div>
      </div>
    );
  }
}

TaskInternal.propTypes = {
  navigate: PropTypes.func,
  params: PropTypes.object,
  location: PropTypes.object,
  taskID: PropTypes.string,
  showZeroCounters: PropTypes.bool,
};

export function Task(props) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  use(UIPreferencesContext);

  return <TaskInternal navigate={navigate} location={location} params={params} {...props} />;
}
