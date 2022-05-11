import React, { useEffect, useRef } from 'react';
import styled, { keyframes } from 'styled-components';

// Derived from https://github.com/mui/material-ui/blob/512896973499adbbda057e7f3685d1b23cc02de9/packages/mui-material/src/LinearProgress/LinearProgress.js

const indeterminate1Keyframe = keyframes`
  0% {
    left: -35%;
    right: 100%;
  }
  60% {
    left: 100%;
    right: -90%;
  }
  100% {
    left: 100%;
    right: -90%;
  }
`;

const LinearProgressRoot = styled.span`
  position: relative;
  overflow: hidden;
  display: block;
  height: 4px;
  z-index: 0;
  background-color: transparent;
  '&::before': {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    background-color: currentColor;
    opacity: 0.3;
  },
`;

const LinearProgressBar1 = styled.span`
  position: absolute;
  left: 0;
  bottom: 0;
  top: 0;
  transition: transform 0.2s linear;
  transform-origin: left;
  background-color: currentColor;
  width: auto;
  animation: ${indeterminate1Keyframe} 2.1s cubic-bezier(0.65, 0.815, 0.735, 0.395) infinite;
`;

export const LinearProgress = () => {
  return (
    <LinearProgressRoot>
      <LinearProgressBar1 />
    </LinearProgressRoot>
  );
};

const LoadingScreen = () => {
  return (
    <div style={{ display: 'flex', flexFlow: 'column', height: '100%', width: '100%' }}>
      <div
        style={{
          flex: '1 1 auto',
          alignItems: 'center',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          flexGrow: 1,
          padding: '3rem',
        }}
      >
        <div style={{ width: '400px' }}>
          <LinearProgress />
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;
