import React from "react";
import { stateProperty, isInvalidNumber, valueToNumber } from ".";
import { Control, FormField } from "./FormField";

export function RequiredNumberField(component, label, name, props = {}) {
  const invalid = stateProperty(component, name, null) === "" || isInvalidNumber(stateProperty(component, name));

  return (
    <FormField label={label} invalid={invalid} invalidFeedback="Must be a valid number or empty">
      <Control
        name={name}
        invalid={invalid}
        value={stateProperty(component, name)}
        onChange={(e) => component.handleChange(e, valueToNumber)}
        data-testid={"control-" + name}
        {...props}
      />
    </FormField>
  );
}
