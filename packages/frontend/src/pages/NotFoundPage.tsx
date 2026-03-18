import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-300">404</h1>
        <p className="mt-2 text-lg text-gray-600">Страница не найдена</p>
        <Link to="/" className="mt-4 inline-block text-sm text-blue-600 hover:text-blue-800">
          Вернуться на главную
        </Link>
      </div>
    </div>
  );
}
