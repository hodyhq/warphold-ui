import React from "react";
import { Row } from "../Layout";
import { Eyebrow } from "../../design/components";
import { LabelColumn } from "./LabelColumn";
import { ValueColumn } from "./ValueColumn";
import { EffectiveValueColumn } from "./EffectiveValueColumn";

export function SectionHeaderRow() {
  return (
    <Row className="border-b border-line-strong pb-2">
      <LabelColumn />
      <ValueColumn>
        <Eyebrow>Defined</Eyebrow>
      </ValueColumn>
      <EffectiveValueColumn>
        <Eyebrow>Effective</Eyebrow>
      </EffectiveValueColumn>
    </Row>
  );
}
