import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React from "react";
import { useNavigate } from "react-router";
import { Button } from "../design/components";

export function GoBackButton() {
  const navigate = useNavigate();

  return (
    <Button onClick={() => navigate(-1)}>
      <FontAwesomeIcon icon={faChevronLeft} /> Return
    </Button>
  );
}
