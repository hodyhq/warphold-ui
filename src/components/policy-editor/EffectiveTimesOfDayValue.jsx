import React from "react";
import { getDeepStateProperty } from "../../utils/deepstate";
import { EffectiveValueColumn } from "./EffectiveValueColumn";
import { TimesOfDayList } from "../../forms/TimesOfDayList";

export function EffectiveTimesOfDayValue(component, policyField) {
  return (
    <EffectiveValueColumn>
      <div className="flex flex-col gap-[6px]">
        {TimesOfDayList(component, "resolved.effective." + policyField)}
        <span data-testid={"definition-" + policyField} className="text-[12px] text-dim">
          {component.policyDefinitionPoint(
            getDeepStateProperty(component, "resolved.definition." + policyField, undefined),
          )}
        </span>
      </div>
    </EffectiveValueColumn>
  );
}
