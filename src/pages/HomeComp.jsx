import React from "react";
import { Link } from "react-router-dom";

function HomeComp() {
  return (
    <div className="container mx-auto flex justify-center items-center h-screen">
      <Link to="/book" className="bg-blue-500 text-white px-4 py-2 rounded-md">
        책목록보기
      </Link>
    </div>
  );
}

export default HomeComp;
