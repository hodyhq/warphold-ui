import React from "react";
import { Col } from "../Layout";
import PropTypes from "prop-types";

export function EffectiveValueColumn(props) {
  return (
    <Col sm={4} data-testid="policy-effective-value">
      {props.children}
    </Col>
  );
}

EffectiveValueColumn.propTypes = {
  children: PropTypes.node,
};
