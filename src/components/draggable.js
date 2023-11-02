import React, { useState, useEffect, useRef } from "react";

var Draggable = (props) => {
  const [pressed, setPressed] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const ref = useRef();

  //To monitor changes to position state and update the DOM
  useEffect(() => {
    if (ref.current) {
      ref.current.style.transform = `translate(${position.x}px, ${position.y}px)`;
    }
  }, [position]);
  //Update the current position if mouse is down
  const onMouseMove = (event) => {
    if (pressed) {
      setPosition({
        x: position.x + event.movement.X,
        y: position.y + event.movement.Y,
      });
    }
  };
  return (
    <div
      style={props.style}
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => {
        setPressed(false);
      }}
    >
      {props.children}
    </div>
  );
};
export default Draggable;
