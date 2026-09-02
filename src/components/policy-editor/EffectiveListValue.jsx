import React from "react";
import { getDeepStateProperty } from "../../utils/deepstate";
import { EffectiveValueColumn } from "./EffectiveValueColumn";
import { Control } from "../../forms/FormField";

export function EffectiveListValue(component, policyField) {
  const dsp = getDeepStateProperty(component, "resolved.definition." + policyField, undefined);

  return (
    <EffectiveValueColumn>
      <div className="flex flex-col gap-[6px]">
        <Control
          as="textarea"
          rows="5"
          data-testid={"effective-" + policyField}
          value={getDeepStateProperty(component, "resolved.effective." + policyField, undefined)}
          readOnly={true}
        />
        <span data-testid={"definition-" + policyField} className="text-[12px] text-dim">
          {component.policyDefinitionPoint(dsp)}
        </span>
      </div>
    </EffectiveValueColumn>
  );
}
