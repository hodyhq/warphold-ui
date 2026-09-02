import React from "react";
import { isInvalidNumber, stateProperty, valueToNumber } from ".";
import { Control, FormField } from "./FormField";

export function OptionalNumberField(component, label, name, props = {}) {
  const invalid = isInvalidNumber(stateProperty(component, name));

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
