import axios from "axios";

const apiBaseUrl = import.meta.env.VITE_API_URL || window.location.origin;

const api = axios.create({ baseURL: apiBaseUrl });

api.interceptors.request.use((config) => {
  const jwt = localStorage.getItem("jwt");

  if (jwt) {
    config.headers.Authorization = `Bearer ${jwt}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && localStorage.getItem("jwt")) {
      localStorage.removeItem("jwt");
      localStorage.removeItem("user");
      sessionStorage.setItem("makiAuthExpired", "1");
      window.location.reload();
    }
    return Promise.reject(error);
  },
);

export const mediaUrl = (url) => (url ? `${api.defaults.baseURL}${url}` : null);

export default api;
