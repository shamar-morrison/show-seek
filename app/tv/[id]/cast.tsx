import CastCrewScreen from '@/src/components/screens/CastCrewScreen';
import { useLocalSearchParams } from 'expo-router';

export default function TVCastScreen() {
  const { id } = useLocalSearchParams();
  return <CastCrewScreen id={Number(id)} type="tv" />;
}
