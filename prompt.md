### Feature Request

---

I want to replace the add to list modal with the latest version of @gorhom/react-native-bottom-sheet. it is normally coupled with Portal from https://oss.callstack.com/react-native-paper/docs/components/Portal/ so you can investigate how to implement the two. I want to maintain the functionality and UI of the original implementation, i just want you to move to this new library and implement it. if you have any questions you can ask.

### Example combo (Paper + Gorhom)

```tsx
import BottomSheet from '@gorhom/bottom-sheet';
import { Portal, Button } from 'react-native-paper';

const MySheet = () => {
  const sheetRef = useRef(null);

  return (
    <Portal>
      <BottomSheet ref={sheetRef} snapPoints={['25%', '50%']}>
        {/* content here */}
      </BottomSheet>
    </Portal>
  );
};
```
