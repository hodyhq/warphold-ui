import React from "react";
import { Col } from "../Layout";
import PropTypes from "prop-types";

export function LabelColumn(props) {
  return (
    <Col sm={4} className="pt-1">
      <span className="font-semibold text-ink">{props.name}</span>
      {props.help && <p className="mt-2 mb-0 text-[12px] leading-[1.6] text-dim">{props.help}</p>}
    </Col>
  );
}

LabelColumn.propTypes = {
  name: PropTypes.string,
  help: PropTypes.string,
};
