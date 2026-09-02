import React from "react";
import { stateProperty } from "../../forms";
import { Control, FormField } from "../../forms/FormField";

export function NotificationFormatSelector(component, name) {
  return (
    <FormField label="Notification Format" required>
      <Control
        as="select"
        name={name}
        onChange={(e) => component.handleChange(e)}
        value={stateProperty(component, name)}
      >
        <option value="txt">Plain Text Format</option>
        <option value="html">HTML Format</option>
      </Control>
    </FormField>
  );
}
