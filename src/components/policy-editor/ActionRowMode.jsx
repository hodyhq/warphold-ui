import React from "react";
import { Row } from "../Layout";
import { stateProperty } from "../../forms";
import { Control } from "../../forms/FormField";
import { LabelColumn } from "./LabelColumn";
import { WideValueColumn } from "./WideValueColumn";
import { EffectiveValue } from "./EffectiveValue";

export function ActionRowMode(component, action) {
  return (
    <Row>
      <LabelColumn
        name="Command Mode"
        help="Essential (must succeed; default behavior), optional (failures are tolerated), or async (Kopia will start the action but not wait for it to finish)"
      />
      <WideValueColumn>
        <Control
          as="select"
          name={"policy." + action}
          onChange={component.handleChange}
          value={stateProperty(component, "policy." + action)}
        >
          <option value="essential">must succeed</option>
          <option value="optional">ignore failures</option>
          <option value="async">run asynchronously, ignore failures</option>
        </Control>
      </WideValueColumn>
      {EffectiveValue(component, action)}
    </Row>
  );
}
