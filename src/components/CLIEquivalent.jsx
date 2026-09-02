import { faCopy, faTerminal } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import axios from "axios";
import React, { useRef, useState } from "react";
import { Button, Input } from "../design/components";
import PropTypes from "prop-types";

export function CLIEquivalent(props) {
  let [visible, setVisible] = useState(false);
  let [cliInfo, setCLIInfo] = useState({});

  if (visible && !cliInfo.executable) {
    axios
      .get("/api/v1/cli")
      .then((result) => {
        setCLIInfo(result.data);
      })
      .catch((_error) => {});
  }

  const ref = useRef(null);

  function copyToClibopard() {
    const el = ref.current;
    if (!el) {
      return;
    }

    el.select();
    el.setSelectionRange(0, 99999);

    document.execCommand("copy");
  }

  return (
    <div className="flex items-center gap-2 pt-4">
      <Button
        data-testid="show-cli-button"
        title="Click to show CLI equivalent"
        aria-expanded={visible}
        onClick={() => setVisible(!visible)}
      >
        <FontAwesomeIcon icon={faTerminal} />
      </Button>
      {visible && (
        <Button title="Copy to clipboard" onClick={copyToClibopard}>
          <FontAwesomeIcon icon={faCopy} />
        </Button>
      )}
      {visible && (
        <Input
          ref={ref}
          className="grow font-mono text-[12px]"
          aria-label="CLI equivalent"
          readOnly={true}
          value={`${cliInfo.executable} ${props.command}`}
        />
      )}
    </div>
  );
}

CLIEquivalent.propTypes = {
  command: PropTypes.string.isRequired,
};
