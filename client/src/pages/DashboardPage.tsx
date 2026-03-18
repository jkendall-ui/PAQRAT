import { useNavigate } from 'react-router-dom';
import { M3Button } from '../components/m3/M3Button';

export function DashboardPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 gap-6" data-testid="dashboard">
      <h1 className="text-2xl font-bold text-gray-900 text-center">
        Welcome to the PAQRat Exam Prep Center!
      </h1>
      <M3Button variant="filled" onClick={() => navigate('/study')} data-testid="lets-go-btn">
        Let's go!
      </M3Button>
    </div>
  );
}
