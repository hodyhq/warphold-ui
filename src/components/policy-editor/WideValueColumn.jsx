import React from "react";
import { Col } from "../Layout";
import PropTypes from "prop-types";

export function WideValueColumn(props) {
  return (
    <Col sm={4} data-testid="policy-value">
      {props.children}
    </Col>
  );
}

WideValueColumn.propTypes = {
  children: PropTypes.node,
};
