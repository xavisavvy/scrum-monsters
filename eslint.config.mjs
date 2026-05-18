import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  // Ignore patterns
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "*.config.js",
      "*.config.mjs",
      "drizzle.config.ts",
      "tailwind.config.ts",
      "postcss.config.js",
      "commitlint.config.js",
    ],
  },

  // Base JavaScript config
  js.configs.recommended,

  // TypeScript files
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        // Node.js globals
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        module: "readonly",
        require: "readonly",
        exports: "readonly",
        global: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        setImmediate: "readonly",
        // Browser globals
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        FormData: "readonly",
        Blob: "readonly",
        File: "readonly",
        FileReader: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        queueMicrotask: "readonly",
        MediaQueryListEvent: "readonly",
        btoa: "readonly",
        atob: "readonly",
        Event: "readonly",
        CustomEvent: "readonly",
        EventTarget: "readonly",
        HTMLElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLTextAreaElement: "readonly",
        HTMLButtonElement: "readonly",
        HTMLFormElement: "readonly",
        HTMLDivElement: "readonly",
        HTMLSpanElement: "readonly",
        HTMLAnchorElement: "readonly",
        HTMLImageElement: "readonly",
        HTMLCanvasElement: "readonly",
        HTMLParagraphElement: "readonly",
        HTMLHeadingElement: "readonly",
        HTMLOListElement: "readonly",
        HTMLUListElement: "readonly",
        HTMLLIElement: "readonly",
        HTMLTableElement: "readonly",
        HTMLTableSectionElement: "readonly",
        HTMLTableRowElement: "readonly",
        HTMLTableCellElement: "readonly",
        HTMLTableCaptionElement: "readonly",
        HTMLQuoteElement: "readonly",
        HTMLAudioElement: "readonly",
        HTMLVideoElement: "readonly",
        HTMLMediaElement: "readonly",
        Image: "readonly",
        Element: "readonly",
        // Node.js types used in browser context
        Express: "readonly",
        Node: "readonly",
        NodeList: "readonly",
        // Browser APIs
        alert: "readonly",
        confirm: "readonly",
        prompt: "readonly",
        crypto: "readonly",
        DOMRect: "readonly",
        MouseEvent: "readonly",
        KeyboardEvent: "readonly",
        TouchEvent: "readonly",
        PointerEvent: "readonly",
        WheelEvent: "readonly",
        FocusEvent: "readonly",
        ClipboardEvent: "readonly",
        DragEvent: "readonly",
        AnimationEvent: "readonly",
        TransitionEvent: "readonly",
        ResizeObserver: "readonly",
        IntersectionObserver: "readonly",
        MutationObserver: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        performance: "readonly",
        WebSocket: "readonly",
        MessageEvent: "readonly",
        Worker: "readonly",
        SharedWorker: "readonly",
        ServiceWorker: "readonly",
        Headers: "readonly",
        Request: "readonly",
        Response: "readonly",
        // WebGL/Three.js
        WebGLRenderingContext: "readonly",
        WebGL2RenderingContext: "readonly",
        WebGLContextEvent: "readonly",
        // Audio
        Audio: "readonly",
        AudioContext: "readonly",
        AudioBuffer: "readonly",
        // React
        React: "readonly",
        JSX: "readonly",
        // Node types in browser context
        NodeJS: "readonly",
        // Test globals
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        test: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        vi: "readonly",
        jest: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      // TypeScript-specific rules
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      // Disabled: existing usages are all intentional (Map.get after has(),
      // required env vars, document.getElementById("root")!, audio refs bound
      // by component lifecycle). Each rewrite to a guard adds noise without
      // catching bugs.
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/ban-ts-comment": [
        "warn",
        {
          "ts-ignore": "allow-with-description",
          "ts-expect-error": "allow-with-description",
        },
      ],

      // General rules
      "no-console": ["error", { "allow": ["warn", "error"] }],
      "no-debugger": "warn",
      "no-unused-vars": "off", // Use TypeScript's version
      "prefer-const": "warn",
      "no-var": "error",
      eqeqeq: ["warn", "always", { null: "ignore" }],
      "no-duplicate-imports": "off", // TypeScript handles this, and we may have type-only imports
      "@typescript-eslint/no-duplicate-imports": "off",
      "no-case-declarations": "warn", // Allow declarations in case blocks (common pattern)
      "@typescript-eslint/no-empty-object-type": "off", // Allow empty interfaces for Socket.IO event types
      "@typescript-eslint/no-namespace": "off", // Allow namespaces for type augmentation
      "@typescript-eslint/no-require-imports": "off", // Allow require in config files
      "@typescript-eslint/ban-types": "off", // Allow Function type in specific cases
      "no-constant-binary-expression": "off", // Allow constant expressions (e.g., for conditional compilation)
      "@typescript-eslint/no-unsafe-function-type": "off", // Allow Function type for event listeners
    },
  },

  // React files
  {
    files: ["client/**/*.tsx", "client/**/*.jsx"],
    plugins: {
      react: react,
      "react-hooks": reactHooks,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // React rules
      ...react.configs.recommended.rules,
      "react/react-in-jsx-scope": "off", // Not needed with React 17+
      "react/prop-types": "off", // Using TypeScript
      "react/display-name": "off",
      "react/no-unescaped-entities": "warn",
      "react/jsx-no-target-blank": "error",
      "react/jsx-key": "error",
      "react/no-unknown-property": [
        "error",
        {
          ignore: [
            "css",
            // React Three Fiber properties
            "attach",
            "args",
            "position",
            "rotation",
            "scale",
            "geometry",
            "material",
            "map",
            "castShadow",
            "receiveShadow",
            "intensity",
            "decay",
            "distance",
            "angle",
            "penumbra",
            "color",
            "transparent",
            "opacity",
            "alphaTest",
            "depthWrite",
            "depthTest",
            "blending",
            "side",
            "toneMapped",
            "vertexColors",
            "wireframe",
            "count",
            "array",
            "itemSize",
            "object",
            "dispose",
            // Custom event handlers
            "onError",
            // CMDK library
            "cmdk-input-wrapper",
          ],
        },
      ],
      // Allow redeclaration for TypeScript context patterns
      "no-redeclare": "off",
      "@typescript-eslint/no-redeclare": "off",

      // React Hooks rules
      ...reactHooks.configs.recommended.rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // Test files - more relaxed rules
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-console": "off",
    },
  },

  // k6 load test files
  {
    files: ["tests/load/**/*.js"],
    languageOptions: {
      globals: {
        __ENV: "readonly",
        __VU: "readonly",
        console: "readonly",
      },
    },
    rules: {
      "no-console": "off",
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Profiling and utility scripts
  {
    files: ["tests/profiling/**/*.ts", "scripts/**/*.ts", "scripts/**/*.js"],
    rules: {
      "no-console": "off",
    },
  },
];
