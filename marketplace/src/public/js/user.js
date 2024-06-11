document.getElementById('email').addEventListener('input', function(e) {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailPattern.test(e.target.value)) {
    e.target.setCustomValidity('');
  } else {
    e.target.setCustomValidity('Invalid email address');
  }
});