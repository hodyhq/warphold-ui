import axios from "axios";
import clsx from "clsx";
import React, { Component } from "react";
import { redirect } from "../utils/uiutil";
import PropTypes from "prop-types";

/**
 * Log level to tone. The server sends the numeric zap levels, but the field is
 * typed loosely enough that the names show up too, so both are mapped.
 * Zap's numeric levels: -1 debug, 0 info, 1 warn, 2+ error/dpanic/panic/fatal.
 */
const LOG_LEVEL_CLASS = {
  debug: "text-dim",
  info: "text-ink",
  warn: "font-bold text-warn",
  warning: "font-bold text-warn",
  error: "font-bold text-bad",
};

function toneForLevel(level) {
  if (typeof level === "number") {
    if (level <= -1) return "text-dim";
    if (level === 0) return "text-ink";
    if (level === 1) return "font-bold text-warn";
    return "font-bold text-bad";
  }
  return LOG_LEVEL_CLASS[level];
}

export class Logs extends Component {
  constructor() {
    super();
    this.state = {
      items: [],
      isLoading: true,
      error: null,
    };

    this.fetchLog = this.fetchLog.bind(this);
    this.interval = window.setInterval(this.fetchLog, 3000);
    this.messagesEndRef = React.createRef();
    this.scrollToBottom = this.scrollToBottom.bind(this);
  }

  componentDidMount() {
    this.fetchLog();
    this.scrollToBottom();
  }

  componentWillUnmount() {
    window.clearInterval(this.interval);
  }

  lastMessage(l) {
    if (!l || !l.length) {
      return "";
    }

    return l[l.length - 1].msg;
  }

  fetchLog() {
    axios
      .get("/api/v1/tasks/" + this.props.taskID + "/logs")
      .then((result) => {
        let oldLogs = this.state.logs;
        this.setState({
          logs: result.data.logs,
          isLoading: false,
        });

        if (this.lastMessage(oldLogs) !== this.lastMessage(result.data.logs)) {
          this.scrollToBottom();
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

  fullLogTime(x) {
    return new Date(x * 1000).toLocaleString();
  }

  formatLogTime(x) {
    const d = new Date(x * 1000);
    let result = "";

    result += ("0" + d.getHours()).substr(-2);
    result += ":";
    result += ("0" + d.getMinutes()).substr(-2);
    result += ":";
    result += ("0" + d.getSeconds()).substr(-2);
    result += ".";
    result += ("00" + d.getMilliseconds()).substr(-3);

    return result;
  }

  formatLogParams(entry) {
    // if there are any properties other than `msg, ts, level, mod` output them as JSON.

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let { msg, ts, level, mod, ...parametersOnly } = entry;

    const p = JSON.stringify(parametersOnly);
    if (p !== "{}") {
      return <code>{p}</code>;
    }

    return "";
  }

  scrollToBottom() {
    const c = this.messagesEndRef.current;
    if (c) {
      c.scrollIntoView({ behavior: "smooth" });
    }
  }

  render() {
    const { logs, isLoading, error } = this.state;
    if (error) {
      return <p>{error.message}</p>;
    }
    if (isLoading) {
      return <p>Loading ...</p>;
    }

    if (logs) {
      return (
        <div
          data-testid="task-logs"
          className={clsx(
            "overflow-auto border border-line bg-ground font-mono text-[11px] leading-[1.7]",
            this.props.className || "max-h-[400px]",
          )}
        >
          {logs.map((v) => (
            <div
              key={v.ts + "-" + v.msg}
              data-log-level={v.level}
              className={clsx("px-3 py-[2px] break-words whitespace-pre-wrap", toneForLevel(v.level) ?? "text-muted")}
              title={this.fullLogTime(v.ts)}
            >
              {this.formatLogTime(v.ts)} {v.msg} {this.formatLogParams(v)}
            </div>
          ))}
          <div ref={this.messagesEndRef} />
        </div>
      );
    }

    return null;
  }
}

Logs.propTypes = {
  taskID: PropTypes.string.isRequired,
  /** Overrides the panel's default max height. */
  className: PropTypes.string,
};
