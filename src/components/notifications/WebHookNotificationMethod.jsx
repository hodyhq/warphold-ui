import React, { Component } from "react";
import { Row } from "../Layout";
import { handleChange, validateRequiredFields, stateProperty } from "../../forms";
import { RequiredField } from "../../forms/RequiredField";
import { Control, FormField } from "../../forms/FormField";
import { OptionalField } from "../../forms/OptionalField";
import { NotificationFormatSelector } from "./NotificationFormatSelector";
import PropTypes from "prop-types";
export class WebHookNotificationMethod extends Component {
  constructor(props) {
    super();

    this.state = {
      format: "txt",
      method: "POST",
      ...props.initial,
    };
    this.handleChange = handleChange.bind(this);
  }

  validate() {
    if (!validateRequiredFields(this, ["endpoint"])) {
      return false;
    }

    return true;
  }

  render() {
    return (
      <>
        <Row>
          {RequiredField(this, "URL Endpoint", "endpoint", { autoFocus: true })}
          <FormField label="HTTP Method" required>
            <Control
              as="select"
              name="method"
              onChange={(e) => this.handleChange(e)}
              value={stateProperty(this, "method")}
            >
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
            </Control>
          </FormField>
          {NotificationFormatSelector(this, "format")}
        </Row>
        <Row>
          {OptionalField(
            this,
            "Additional Headers",
            "headers",
            { as: "textarea", rows: 5 },
            "Enter one header per line in the format 'Header: Value'.",
          )}
        </Row>
      </>
    );
  }
}

WebHookNotificationMethod.propTypes = {
  initial: PropTypes.object,
};
