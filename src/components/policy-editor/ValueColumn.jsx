import React from "react";
import { Col } from "../Layout";
import PropTypes from "prop-types";

export function ValueColumn(props) {
  return (
    <Col sm={4} data-testid="policy-value">
      {props.children}
    </Col>
  );
}

ValueColumn.propTypes = {
  children: PropTypes.node,
};
