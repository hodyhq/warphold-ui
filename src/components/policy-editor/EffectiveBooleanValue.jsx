import React from "react";
import { getDeepStateProperty } from "../../utils/deepstate";
import { EffectiveValueColumn } from "./EffectiveValueColumn";
import { Checkbox } from "../../design/components";

export function EffectiveBooleanValue(component, policyField) {
  const dsp = getDeepStateProperty(component, "resolved.definition." + policyField, undefined);

  return (
    <EffectiveValueColumn>
      <div className="flex flex-col gap-[6px]">
        <Checkbox
          data-testid={"effective-" + policyField}
          checked={getDeepStateProperty(component, "resolved.effective." + policyField, undefined) ?? false}
          readOnly={true}
        />
        <span data-testid={"definition-" + policyField} className="text-[12px] text-dim">
          {component.policyDefinitionPoint(dsp)}
        </span>
      </div>
    </EffectiveValueColumn>
  );
}
