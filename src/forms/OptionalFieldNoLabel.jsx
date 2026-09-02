import React from "react";
import { stateProperty } from ".";
import { Control, FormField } from "./FormField";

export function OptionalFieldNoLabel(component, label, name, props = {}, helpText = null, invalidFeedback = null) {
  return (
    <FormField help={helpText} invalid={Boolean(invalidFeedback)} invalidFeedback={invalidFeedback}>
      <Control
        name={name}
        value={stateProperty(component, name)}
        data-testid={"control-" + name}
        onChange={component.handleChange}
        {...props}
      />
    </FormField>
  );
}
