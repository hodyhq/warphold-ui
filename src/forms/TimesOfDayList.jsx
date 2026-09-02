import React from "react";
import { stateProperty } from ".";
import { Control, FieldFrame } from "./FormField";

export function TimesOfDayList(component, name, props = {}) {
  function parseTimeOfDay(v) {
    var re = /(\d+):(\d+)/;

    const match = re.exec(v);
    if (match) {
      const h = parseInt(match[1]);
      const m = parseInt(match[2]);
      let valid = h < 24 && m < 60;

      if (m < 10 && match[2].length === 1) {
        valid = false;
      }

      if (valid) {
        return { hour: h, min: m };
      }
    }

    return v;
  }

  function toMultilineString(v) {
    if (v) {
      let tmp = [];

      for (const tod of v) {
        if (typeof tod === "object") {
          tmp.push(tod.hour + ":" + (tod.min < 10 ? "0" : "") + tod.min);
        } else {
          tmp.push(tod);
        }
      }

      return tmp.join("\n");
    }

    return "";
  }

  function fromMultilineString(target) {
    const v = target.value;
    if (v === "") {
      return undefined;
    }

    let result = [];

    for (const line of v.split(/\n/)) {
      result.push(parseTimeOfDay(line));
    }

    return result;
  }

  // An entry that could not be parsed is kept as the raw string, which is what
  // makes the field invalid. Bootstrap rendered this message always and hid it
  // with CSS; without that stylesheet it has to be conditional to stay true.
  const value = stateProperty(component, name);
  const invalid = Array.isArray(value) && value.some((tod) => typeof tod !== "object");

  return (
    <FieldFrame>
      <Control
        as="textarea"
        name={name}
        rows="5"
        invalid={invalid}
        value={toMultilineString(value)}
        onChange={(e) => component.handleChange(e, fromMultilineString)}
        {...props}
      />
      {invalid && (
        <span role="alert" className="text-[12px] text-bad">
          Invalid Times of Day
        </span>
      )}
    </FieldFrame>
  );
}
