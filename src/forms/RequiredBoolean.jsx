import React from "react";
import { stateProperty } from ".";
import { Checkbox } from "../design/components";
import { FieldFrame } from "./FormField";

function checkedToBool(t) {
  if (t.checked) {
    return true;
  }

  return false;
}

export function RequiredBoolean(component, label, name, helpText) {
  return (
    <FieldFrame className="required">
      <Checkbox
        label={label}
        name={name}
        checked={stateProperty(component, name)}
        onChange={(e) => component.handleChange(e, checkedToBool)}
        data-testid={"control-" + name}
      />
      {helpText && <span className="text-[12px] text-dim">{helpText}</span>}
    </FieldFrame>
  );
}
