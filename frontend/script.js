function sendEmailAndRedirect(){
    const subject = encodeURIComponent("Request for SmartMerit Free Trial Access");
    const body = encodeURIComponent(`Dear SmartMerit Team,

                I would like to request access to the free trial version of SmartMerit. Please find my details below:

                Name: [Your Full Name]  
                Email: [Your Email]  
                Phone: [Your Phone Number]  
                Organization/School: [Your Institution Name]  
                Designation: [Your Role, e.g., Teacher, Principal, Admin]  
                Purpose of Use: [Brief explanation, e.g., Track student performance, test features]  
                Expected Number of Students: [Less Than 50 students]  
                Preferred Trial Start Date: [DD-MM-YYYY]

                Looking forward to your confirmation.

                Best regards,  
                [Your Name]`
);

    const mailtoLink = `mailto:mesagnik279@gmail.com?subject=${subject}&body=${body}`;
    window.location.href = mailtoLink;
}

//how it works portion
const openButton = document.querySelectorAll('[data-htw-target]')
const closeButton = document.querySelectorAll('[data-htw-close]')
const overlay = document.getElementById('overlay')

openButton.forEach( button =>{
    button.addEventListener('click', () =>{
        const content = document.querySelector(button.dataset.htwTarget)
        openContent(content)
    })
})

overlay.addEventListener('click', (event) => {
    if (event.target === overlay) { // Ensures click is directly on the overlay
        const contentsOverlay = document.querySelectorAll('.htw-content.active')
        contentsOverlay.forEach(content => {
            closeContent(content);
        });
    }
});

closeButton.forEach( button =>{
    button.addEventListener('click', () =>{
        const content = button.closest('.htw-content')
        closeContent(content)
    })
})

function openContent(content){
    if(content==null)
        return
    content.classList.add('active')
    overlay.classList.add('active')
}

function closeContent(content){
    if(content==null)
        return
    content.classList.remove('active')
    overlay.classList.remove('active')
}

document.getElementById("feedbackForm").addEventListener("submit", function(e) {
    e.preventDefault();
    const feedback = document.getElementById("feedback").value;
    const api = "https://smart-merit.vercel.app";
    fetch(`${api}/submit-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback })
    })
    .then(res => res.json())
    .then(data => {
        document.getElementById("feedbackMessage").textContent = data.message;
        this.reset();
    })
    .catch(() => {
        document.getElementById("feedbackMessage").textContent = "Something went wrong. Please try again later.";
    });
});
