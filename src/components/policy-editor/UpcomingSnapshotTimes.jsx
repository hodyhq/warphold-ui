import moment from "moment";
import React from "react";
import { LabelColumn } from "./LabelColumn";

export function UpcomingSnapshotTimes(resolved) {
  if (!resolved) {
    return null;
  }

  if (resolved.schedulingError) {
    return <p className="text-bad">{resolved.schedulingError}</p>;
  }

  const times = resolved.upcomingSnapshotTimes;

  if (!times) {
    return <LabelColumn name="No upcoming snapshots" />;
  }

  return (
    <>
      <LabelColumn name="Upcoming" />

      <ul data-testid="upcoming-snapshot-times" className="m-0 list-disc pl-5 text-[13px] text-muted">
        {times.map((x) => (
          <li key={x}>
            {moment(x).format("L LT")} ({moment(x).fromNow()})
          </li>
        ))}
      </ul>
    </>
  );
}
