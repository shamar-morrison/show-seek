# Show-Seek Project Structure Answers

## 1. Project Structure: How is your project organized?

The project follows an **Expo Router file-based routing** structure combined with a modular `/src` directory:

```
/app                    # Expo Router file-based routing
  /(auth)               # Authentication screens
  /(tabs)               # Tab-based navigation
  _layout.tsx           # Root layout with providers

/src                    # Source modules
  /api                  # API utilities
  /components           # Reusable UI components (76+ files)
    /cards              # Card components
    /detail             # Detail page components
    /library            # Library-specific components
    /reminder           # Reminder components
    /ui                 # Base UI components (Button, Toast, etc.)
    /watching           # Currently watching components
  /constants            # Theme, colors, and static values
  /context              # React Contexts (Auth, Premium, Tab)
  /firebase             # Firebase configuration and utilities
  /hooks                # Custom React hooks (23 files)
  /screens              # Screen components (14 files)
  /services             # Business logic and API services
  /types                # TypeScript type definitions
  /utils                # Utility functions
```

---

## 2. Truesheet Library: Which bottom sheet/modal library are you using?

The project uses **`@lodev09/react-native-true-sheet`** (v3.2.1).

---

## 3. TypeScript or JavaScript: Is your project using TypeScript or JavaScript?

The project uses **TypeScript** (v5.9.2).

---

## 4. Styling Approach: What styling system are you using?

The project uses **React Native's built-in `StyleSheet`** combined with a **custom theme system**:

- Theme constants are defined in `/src/constants/theme.ts` (includes `COLORS`)
- Components use `StyleSheet.create()` for styling
- No styled-components or NativeWind/Tailwind

---

## 5. Navigation: Which navigation library and structure?

The project uses **Expo Router** (v6.0.19) with **React Navigation** under the hood:

- **Stack navigation** for main flow
- **Tab navigation** within `/(tabs)` directory
- Auth group routing in `/(auth)`
- File-based routing via Expo Router conventions

---

## 6. Firebase Setup: How is your Firebase currently structured?

Firebase is structured in `/src/firebase/`:

| File           | Purpose                                                         |
| -------------- | --------------------------------------------------------------- |
| `config.ts`    | Firebase initialization and exports (`auth`, `db`, `functions`) |
| `auth.ts`      | Authentication logic                                            |
| `firestore.ts` | Firestore utilities                                             |
| `user.ts`      | User-related Firebase operations                                |

Additional Firebase files:

- `firestore.rules` - Security rules
- `firebase.json` - Firebase configuration
- `firestore.indexes.json` - Firestore indexes

---

## 7. Premium Gating: How do you currently check for premium status?

The project uses a **`usePremium()` hook** exported from `/src/context/PremiumContext.tsx`:

```typescript
import { usePremium } from '@/src/context/PremiumContext';

// Inside a component:
const { isPremium, isLoading, purchasePremium, restorePurchases, price } = usePremium();
```

The context:

- Syncs with Firestore user document (`users/{uid}.premium.isPremium`)
- Caches premium status in AsyncStorage
- Handles in-app purchases via `react-native-iap`

---

## 8. Detail Screens: Are your Movie and TV detail screens separate components or one shared component?

They are **separate components** in `/src/screens/`:

- `MovieDetailScreen.tsx`
- `TVDetailScreen.tsx`

---

## 9. Existing Components: Do you have reusable Button or Input components I should reference?

**Button Component:** Yes, located at `/src/components/ui/Button.tsx`

**Input Component:** No dedicated Input component found.

**Other reusable UI components** in `/src/components/ui/`:

- `AnimatedCheck.tsx`
- `AnimatedScrollHeader.tsx`
- `BlurredText.tsx`
- `ExpandableText.tsx`
- `ImagePlaceholder.tsx`
- `ListMembershipBadge.tsx`
- `LoadingSkeleton.tsx`
- `MediaImage.tsx`
- `ModalBackground.tsx`
- `PremiumBadge.tsx`
- `ProgressBar.tsx`
- `SearchableHeader.tsx`
- `SectionSeparator.tsx`
- `ShareButton.tsx`
- `Toast.tsx`
