import { faBan, faCheck, faExclamationCircle, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import axios from "axios";
import React from "react";
import { Spinner } from "../design/components";
import { formatDuration } from "./formatutils";

export function cancelTask(tid) {
  axios
    .post("/api/v1/tasks/" + tid + "/cancel", {})
    .then((_result) => {})
    .catch((_error) => {});
}

export function taskStatusSymbol(task) {
  const st = task.status;
  const dur = formatDuration(task.startTime, task.endTime, true);

  switch (st) {
    case "RUNNING":
      return (
        <span className="inline-flex items-center gap-2">
          <Spinner size={14} /> Running for {dur}
          <button
            className="cursor-pointer border-0 bg-transparent p-0 text-bad"
            type="button"
            title="Cancel task"
            aria-label="Cancel task"
            onClick={() => cancelTask(task.id)}
          >
            <FontAwesomeIcon size="lg" icon={faXmark} />
          </button>
        </span>
      );
    case "SUCCESS":
      return (
        <span title={dur} className="inline-flex items-center gap-2 text-good">
          <FontAwesomeIcon icon={faCheck} /> Finished in {dur}
        </span>
      );

    case "FAILED":
      return (
        <span title={dur} className="inline-flex items-center gap-2 text-bad">
          <FontAwesomeIcon icon={faExclamationCircle} /> Failed after {dur}
        </span>
      );

    case "CANCELED":
      return (
        <span title={dur} className="inline-flex items-center gap-2 text-muted">
          <FontAwesomeIcon icon={faBan} /> Canceled after {dur}
        </span>
      );

    default:
      return st;
  }
}
